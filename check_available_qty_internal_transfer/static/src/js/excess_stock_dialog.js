odoo.define('check_available_qty_internal_transfer.excess_stock_dialog', function (require) {
    "use strict";

    var Dialog = require('web.Dialog');
    var CrashManager = require('web.CrashManager');
    var core = require('web.core');
    var _t = core._t;

    function isExcessStockError(error) {
        if (!error) return false;
        var str = "";
        if (typeof error === 'string') {
            str = error;
        } else {
            if (error.data && error.data.message) {
                str += " " + error.data.message;
            }
            if (error.data && error.data.arguments && Array.isArray(error.data.arguments)) {
                str += " " + error.data.arguments.join(" ");
            }
            if (error.message) {
                str += " " + error.message;
            }
            if (error.$content && typeof error.$content.text === 'function') {
                str += " " + error.$content.text();
            } else if (typeof error.$content === 'string') {
                str += " " + error.$content;
            }
            if (error.title) {
                str += " " + error.title;
            }
        }
        return str.includes("Jumlah Kuantitas Yang Diinput Melebihi Stok");
    }

    function saveWithExcessStockContext(widget) {
        var webClient = core.bus;
        var actionManager = (widget && widget.action_manager) || (webClient && webClient.action_manager);
        if (!actionManager && window.odoo && window.odoo.__DEBUG__ && window.odoo.__DEBUG__.services) {
            var wc = window.odoo.__DEBUG__.services['web.web_client'];
            if (wc) {
                actionManager = wc.action_manager;
            }
        }

        var controller = actionManager && actionManager.getCurrentController && actionManager.getCurrentController();
        var formWidget = controller && (controller.widget || controller);

        if (formWidget && typeof formWidget.saveRecord === 'function') {
            formWidget.saveRecord(formWidget.handle, {
                additionalContext: { skip_excess_check: true },
                reload: true,
            }).then(function () {
                core.bus.trigger('display_notification', {
                    title: _t("Excess Stock Input"),
                    message: _t("Data produk berhasil dimasukkan ke menu Excess Stock Input in Internal Transfer."),
                    type: 'info',
                });
            });
        } else {
            core.bus.trigger('display_notification', {
                title: _t("Excess Stock Input"),
                message: _t("Data produk telah dicatat ke menu Excess Stock Input in Internal Transfer."),
                type: 'info',
            });
        }
    }

    Dialog.include({
        init: function (parent, options) {
            options = options || {};
            if (isExcessStockError(options) || isExcessStockError(options.$content) || isExcessStockError(options.title)) {
                var self = this;
                var hasInfoBtn = false;
                if (options.buttons) {
                    for (var i = 0; i < options.buttons.length; i++) {
                        if (options.buttons[i].text === _t("Information") || options.buttons[i].text === "Information") {
                            hasInfoBtn = true;
                            break;
                        }
                    }
                } else {
                    options.buttons = [];
                }

                if (!hasInfoBtn) {
                    options.buttons = [
                        {
                            text: _t("Ok"),
                            class: 'btn-primary',
                            close: true,
                        },
                        {
                            text: _t("Information"),
                            class: 'btn-info',
                            click: function () {
                                self.close();
                                saveWithExcessStockContext(parent || self);
                            }
                        }
                    ];
                }
            }
            this._super.apply(this, arguments);
        },
    });

    CrashManager.include({
        _handleExcessStockError: function (error) {
            if (isExcessStockError(error)) {
                var self = this;
                var parentWidget = self.getParent && self.getParent();
                var dialog = new Dialog(this, {
                    title: (error.data && error.data.title) || _t("User Error"),
                    $content: $('<div>').text(_t("Jumlah Kuantitas Yang Diinput Melebihi Stok")),
                    buttons: [
                        {
                            text: _t("Ok"),
                            class: 'btn-primary',
                            close: true,
                        },
                        {
                            text: _t("Information"),
                            class: 'btn-info',
                            click: function () {
                                dialog.close();
                                saveWithExcessStockContext(parentWidget || self);
                            }
                        }
                    ]
                });
                dialog.open();
                return true;
            }
            return false;
        },

        show_warning: function (error) {
            if (this._handleExcessStockError(error)) {
                return;
            }
            return this._super.apply(this, arguments);
        },

        show_error: function (error) {
            if (this._handleExcessStockError(error)) {
                return;
            }
            return this._super.apply(this, arguments);
        },
    });
});
