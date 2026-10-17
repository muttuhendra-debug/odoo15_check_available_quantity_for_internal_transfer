odoo.define('check_available_qty_internal_transfer.excess_stock_dialog', function (require) {
    "use strict";

    var Dialog = require('web.Dialog');
    var CrashManager = require('web.CrashManager');
    var WebClient = require('web.WebClient');
    var core = require('web.core');
    var _t = core._t;

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
            try {
                return extractText(obj(), depth + 1);
            } catch (e) {
                return "";
            }
        }
        if (typeof obj.text === 'function') {
            try {
                var t = obj.text();
                var h = typeof obj.html === 'function' ? obj.html() : "";
                return (t || "") + " " + (h || "");
            } catch (e) {}
        }
        if (obj.nodeType) {
            return obj.textContent || obj.innerText || "";
        }
        var result = "";
        if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length; i++) {
                result += " " + extractText(obj[i], depth + 1);
            }
            return result;
        }
        if (typeof obj === 'object') {
            if (obj.message) result += " " + extractText(obj.message, depth + 1);
            if (obj.data) result += " " + extractText(obj.data, depth + 1);
            if (obj.arguments) result += " " + extractText(obj.arguments, depth + 1);
            if (obj.title) result += " " + extractText(obj.title, depth + 1);
            if (obj.$content) result += " " + extractText(obj.$content, depth + 1);
            if (obj.error) result += " " + extractText(obj.error, depth + 1);

            if (!result.trim()) {
                for (var key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key) && key !== 'parent' && key !== 'owner' && key !== 'widget') {
                        var val = obj[key];
                        if (typeof val === 'string' || typeof val === 'number') {
                            result += " " + val;
                        }
                    }
                }
            }
        }
        return result;
    }

    function isExcessStockError(obj) {
        var text = extractText(obj);
        return text.indexOf("Jumlah Kuantitas Yang Diinput Melebihi Stok") !== -1;
    }

    function findFormWidget(widget) {
        var cur = widget;
        while (cur) {
            if (typeof cur.saveRecord === 'function') {
                return cur;
            }
            if (cur.currentController && typeof cur.currentController.saveRecord === 'function') {
                return cur.currentController;
            }
            if (cur.widget && typeof cur.widget.saveRecord === 'function') {
                return cur.widget;
            }
            cur = cur.getParent ? cur.getParent() : null;
        }

        if (currentWebClientInstance && currentWebClientInstance.action_manager) {
            var am = currentWebClientInstance.action_manager;
            var controller = am.getCurrentController && am.getCurrentController();
            if (controller) {
                if (typeof controller.saveRecord === 'function') return controller;
                if (controller.widget && typeof controller.widget.saveRecord === 'function') return controller.widget;
            }
            if (am.actions) {
                for (var k in am.actions) {
                    var a = am.actions[k];
                    if (a && a.widget && typeof a.widget.saveRecord === 'function') {
                        return a.widget;
                    }
                }
            }
        }
        return null;
    }

    function saveWithExcessStockContext(widget) {
        var formWidget = findFormWidget(widget);

        if (formWidget) {
            if (formWidget.model && formWidget.handle && formWidget.model.localData && formWidget.model.localData[formWidget.handle]) {
                var record = formWidget.model.localData[formWidget.handle];
                if (record.context) {
                    record.context.skip_excess_check = true;
                }
            }
            if (formWidget.initialState && formWidget.initialState.context) {
                formWidget.initialState.context.skip_excess_check = true;
            }

            var extraCtx = { skip_excess_check: true };
            var saveOptions = {
                context: extraCtx,
                additionalContext: extraCtx,
                extraContext: extraCtx,
                reload: true,
            };

            formWidget.saveRecord(formWidget.handle, saveOptions).then(function () {
                if (core && core.bus) {
                    core.bus.trigger('display_notification', {
                        title: _t("Excess Stock Input"),
                        message: _t("Data produk berhasil dimasukkan ke menu Excess Stock Input in Internal Transfer."),
                        type: 'info',
                    });
                }
            }).catch(function () {
                if (typeof formWidget.save === 'function') {
                    formWidget.save(formWidget.handle, saveOptions);
                }
            });
        } else {
            var $saveBtn = $('.o_form_button_save:visible, button.o_form_button_save');
            if ($saveBtn.length) {
                $saveBtn.click();
            }
            if (core && core.bus) {
                core.bus.trigger('display_notification', {
                    title: _t("Excess Stock Input"),
                    message: _t("Data produk telah dicatat ke menu Excess Stock Input in Internal Transfer."),
                    type: 'info',
                });
            }
        }
    }

    Dialog.include({
        init: function (parent, options) {
            options = options || {};
            var isExcess = isExcessStockError(options) || isExcessStockError(parent);
            if (!isExcess && options.$content) {
                isExcess = isExcessStockError(options.$content);
            }
            if (isExcess) {
                var self = this;
                options.buttons = options.buttons || [];
                var hasInfoBtn = false;
                for (var i = 0; i < options.buttons.length; i++) {
                    var btnText = options.buttons[i].text || "";
                    if (btnText === _t("Information") || btnText === "Information") {
                        hasInfoBtn = true;
                        break;
                    }
                }
                if (!hasInfoBtn) {
                    options.buttons.push({
                        text: _t("Information"),
                        class: 'btn-info',
                        click: function () {
                            self.close();
                            saveWithExcessStockContext(parent || self);
                        }
                    });
                }
            }
            this._super.apply(this, arguments);
        },

        start: function () {
            var self = this;
            return this._super.apply(this, arguments).then(function () {
                try {
                    if (isExcessStockError(self.$el) || isExcessStockError(self.$content) || isExcessStockError(self.title) || isExcessStockError(self.options)) {
                        var $footer = self.$footer || (self.$el && self.$el.find('.modal-footer, .o_dialog_footer, footer'));
                        if ($footer && $footer.length) {
                            var hasInfo = $footer.find('button:contains("Information")').length > 0;
                            if (!hasInfo) {
                                var $infoBtn = $('<button>')
                                    .attr('type', 'button')
                                    .addClass('btn btn-info o_excess_stock_info_btn')
                                    .text(_t("Information"))
                                    .css('margin-left', '5px')
                                    .on('click', function () {
                                        self.close();
                                        saveWithExcessStockContext(self);
                                    });
                                $footer.append($infoBtn);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error in excess stock dialog start override:", e);
                }
            });
        },
    });

    CrashManager.include({
        _handleExcessStockError: function (error) {
            if (isExcessStockError(error)) {
                var self = this;
                var parentWidget = self.getParent && self.getParent();
                var dialog = new Dialog(this, {
                    title: (error && error.data && error.data.title) || _t("User Error"),
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

        rpc_error: function (error) {
            if (this._handleExcessStockError(error)) {
                return;
            }
            return this._super.apply(this, arguments);
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

    // Global DOM Observer for OWL Dialogs or direct web client modal rendering
    function injectInfoButtonIntoDOMModal(modalEl) {
        if (!modalEl || !modalEl.textContent) return;
        if (modalEl.textContent.indexOf("Jumlah Kuantitas Yang Diinput Melebihi Stok") === -1) return;

        var footer = modalEl.querySelector('.modal-footer, .o_dialog_footer, footer');
        if (!footer) return;

        if (footer.querySelector('.o_excess_stock_info_btn')) return;

        var infoBtn = document.createElement('button');
        infoBtn.type = 'button';
        infoBtn.className = 'btn btn-info o_excess_stock_info_btn';
        infoBtn.textContent = 'Information';
        infoBtn.style.marginLeft = '5px';

        infoBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var closeBtn = modalEl.querySelector('.btn-primary, .close, [data-dismiss="modal"], .o_dialog_close_btn, button.btn-secondary, button.btn-danger');
            if (closeBtn) {
                closeBtn.click();
            } else {
                if (window.$ && $(modalEl).modal) {
                    $(modalEl).modal('hide');
                }
                if (modalEl.parentNode) {
                    modalEl.parentNode.removeChild(modalEl);
                }
            }

            saveWithExcessStockContext();
        });

        footer.appendChild(infoBtn);
    }

    function scanAllModals() {
        var selectors = ['.modal', '.o_dialog', '.o_technical_modal', '.modal-dialog', 'div[role="dialog"]'];
        for (var s = 0; s < selectors.length; s++) {
            var elements = document.querySelectorAll(selectors[s]);
            for (var i = 0; i < elements.length; i++) {
                injectInfoButtonIntoDOMModal(elements[i]);
            }
        }
    }

    var mutationObserver = new MutationObserver(function () {
        scanAllModals();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            scanAllModals();
            if (document.body) {
                mutationObserver.observe(document.body, { childList: true, subtree: true });
            }
        });
    } else {
        scanAllModals();
        if (document.body) {
            mutationObserver.observe(document.body, { childList: true, subtree: true });
        }
    }
});
