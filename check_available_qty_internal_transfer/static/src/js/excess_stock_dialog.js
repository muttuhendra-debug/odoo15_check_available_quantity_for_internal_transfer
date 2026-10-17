odoo.define('check_available_qty_internal_transfer.excess_stock_dialog', function (require) {
    "use strict";

    var Dialog = require('web.Dialog');
    var CrashManager = require('web.CrashManager');
    var WebClient = require('web.WebClient');
    var core = require('web.core');
    var _t = core ? core._t : function (s) { return s; };

    var currentWebClientInstance = null;

    WebClient.include({
        init: function () {
            this._super.apply(this, arguments);
            currentWebClientInstance = this;
        },
    });

    function extractText(obj, depth) {
        if (!obj || (depth && depth > 5)) return "";
        depth = depth || 0;
        if (typeof obj === 'string') return obj;
        if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
        if (typeof obj === 'function') {
            try { return extractText(obj(), depth + 1); } catch (e) { return ""; }
        }
        if (obj.jquery || obj.nodeType) {
            try {
                return (obj.textContent || obj.innerText || (typeof obj.text === 'function' ? obj.text() : "")) + " " + (typeof obj.html === 'function' ? obj.html() : "");
            } catch (e) { return ""; }
        }
        var res = "";
        if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length; i++) {
                res += " " + extractText(obj[i], depth + 1);
            }
            return res;
        }
        if (typeof obj === 'object') {
            if (obj.message) res += " " + extractText(obj.message, depth + 1);
            if (obj.data) res += " " + extractText(obj.data, depth + 1);
            if (obj.title) res += " " + extractText(obj.title, depth + 1);
            if (obj.$content) res += " " + extractText(obj.$content, depth + 1);
            if (!res.trim()) {
                for (var k in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, k) && k !== 'parent' && k !== 'owner' && k !== 'widget') {
                        var val = obj[k];
                        if (typeof val === 'string' || typeof val === 'number') res += " " + val;
                    }
                }
            }
        }
        return res;
    }

    function isExcessStockError(obj) {
        return extractText(obj).indexOf("Jumlah Kuantitas Yang Diinput Melebihi Stok") !== -1;
    }

    function findActiveFormWidget(widget) {
        var cur = widget;
        while (cur) {
            if (typeof cur.saveRecord === 'function') return cur;
            if (cur.currentController && typeof cur.currentController.saveRecord === 'function') return cur.currentController;
            cur = cur.getParent ? cur.getParent() : null;
        }

        if (currentWebClientInstance && currentWebClientInstance.action_manager) {
            var am = currentWebClientInstance.action_manager;
            var controller = am.getCurrentController && am.getCurrentController();
            if (controller && typeof controller.saveRecord === 'function') return controller;
        }
        return null;
    }

    function triggerFormSaveWithExcessContext(ownerWidget) {
        var formWidget = findActiveFormWidget(ownerWidget);
        var extraCtx = { skip_excess_check: true };

        if (formWidget && typeof formWidget.saveRecord === 'function') {
            if (formWidget.model && formWidget.handle && formWidget.model.localData && formWidget.model.localData[formWidget.handle]) {
                var record = formWidget.model.localData[formWidget.handle];
                if (record.context) record.context.skip_excess_check = true;
            }
            if (formWidget.initialState && formWidget.initialState.context) {
                formWidget.initialState.context.skip_excess_check = true;
            }

            formWidget.saveRecord(formWidget.handle, {
                context: extraCtx,
                additionalContext: extraCtx,
                extraContext: extraCtx,
                reload: true,
            });
        }
    }

    Dialog.include({
        init: function (parent, options) {
            options = options || {};
            if (isExcessStockError(options) || isExcessStockError(parent) || isExcessStockError(options.$content)) {
                var self = this;
                options.buttons = options.buttons || [];
                var hasInfo = false;
                for (var i = 0; i < options.buttons.length; i++) {
                    if (options.buttons[i].text === _t("Information") || options.buttons[i].text === "Information") {
                        hasInfo = true;
                        break;
                    }
                }
                if (!hasInfo) {
                    options.buttons.push({
                        text: _t("Information"),
                        class: 'btn-info',
                        click: function () {
                            self.close();
                            triggerFormSaveWithExcessContext(parent || self);
                        }
                    });
                }
            }
            this._super.apply(this, arguments);
        },
        start: function () {
            var self = this;
            return this._super.apply(this, arguments).then(function () {
                if (isExcessStockError(self.$el) || isExcessStockError(self.options)) {
                    var $footer = self.$footer || (self.$el && self.$el.find('.modal-footer, .o_dialog_footer, footer'));
                    if ($footer && $footer.length && !$footer.find('.o_excess_stock_info_btn').length) {
                        var $infoBtn = $('<button>')
                            .attr('type', 'button')
                            .addClass('btn btn-info o_excess_stock_info_btn')
                            .text(_t("Information"))
                            .css('margin-left', '5px')
                            .on('click', function () {
                                self.close();
                                triggerFormSaveWithExcessContext(self);
                            });
                        $footer.append($infoBtn);
                    }
                }
            });
        }
    });

    CrashManager.include({
        show_warning: function (error) {
            if (error && isExcessStockError(error)) {
                var self = this;
                var dialog = new Dialog(this, {
                    title: (error && error.data && error.data.title) || (error && error.title) || _t("User Error"),
                    $content: $('<div>').text(_t("Jumlah Kuantitas Yang Diinput Melebihi Stok")),
                    buttons: [
                        { text: _t("Ok"), class: 'btn-primary', close: true },
                        {
                            text: _t("Information"),
                            class: 'btn-info',
                            click: function () {
                                dialog.close();
                                triggerFormSaveWithExcessContext(self);
                            }
                        }
                    ]
                });
                dialog.open();
                return;
            }
            return this._super.apply(this, arguments);
        },
    });
});
