odoo.define('check_available_qty_internal_transfer.excess_stock_dialog', function (require) {
    "use strict";

    var CrashManager = require('web.CrashManager');
    var Dialog = require('web.Dialog');
    var core = require('web.core');
    var _t = core._t;

    CrashManager.include({
        _handleExcessStockError: function (error) {
            if (error && error.data && error.data.message && error.data.message.includes("Jumlah Kuantitas Yang Diinput Melebihi Stok")) {
                var self = this;
                var dialog = new Dialog(this, {
                    title: error.data.title || _t("User Error"),
                    $content: $('<div>').text(error.data.message),
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
                                var webClient = self.getParent && self.getParent();
                                var actionManager = webClient && (webClient.action_manager || (webClient.getParent && webClient.getParent().action_manager));
                                var controller = actionManager && actionManager.getCurrentController && actionManager.getCurrentController();
                                var formWidget = controller && (controller.widget || controller);

                                if (formWidget && typeof formWidget.saveRecord === 'function') {
                                    formWidget.saveRecord(formWidget.handle, {
                                        additionalContext: { skip_excess_check: true }
                                    }).then(function () {
                                        self.displayNotification({
                                            title: _t("Excess Stock Input"),
                                            message: _t("Data produk berhasil dimasukkan ke menu Excess Stock Input in Internal Transfer."),
                                            type: 'info',
                                        });
                                    });
                                } else {
                                    self.displayNotification({
                                        title: _t("Excess Stock Input"),
                                        message: _t("Data produk telah dicatat ke menu Excess Stock Input in Internal Transfer."),
                                        type: 'info',
                                    });
                                }
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
