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

    function extractText(node) {
        if (!node) return "";
        if (typeof node === 'string') return node;
        if (typeof node === 'number') return String(node);
        if (node.jquery) return node.text() || "";
        if (node.nodeType) return node.textContent || node.innerText || "";
        if (typeof node === 'object') {
            var str = "";
            if (node.message) str += " " + extractText(node.message);
            if (node.data) str += " " + extractText(node.data);
            if (node.title) str += " " + extractText(node.title);
            if (node.$content) str += " " + extractText(node.$content);
            return str;
        }
        return "";
    }

    function isExcessStockMessage(text) {
        if (!text) return false;
        return text.indexOf("Jumlah Kuantitas Yang Diinput Melebihi Stok") !== -1;
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

    function attachInformationButtonToElement($dialogEl, dialogInstance) {
        if (!$dialogEl || !$dialogEl.length) return;
        var text = $dialogEl.text() || "";
        if (!isExcessStockMessage(text)) return;

        var $footer = $dialogEl.find('.modal-footer, .o_dialog_footer, footer');
        if (!$footer.length) {
            $footer = $dialogEl.closest('.modal-content, .o_dialog').find('.modal-footer, .o_dialog_footer, footer');
        }

        if ($footer.length && !$footer.find('.o_excess_stock_info_btn').length) {
            var $infoBtn = $('<button>')
                .attr('type', 'button')
                .addClass('btn btn-info o_excess_stock_info_btn')
                .text(_t("Information"))
                .css({'margin-left': '5px', 'margin-right': '5px'})
                .on('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dialogInstance && typeof dialogInstance.close === 'function') {
                        dialogInstance.close();
                    } else {
                        $dialogEl.closest('.modal, .o_dialog').find('.close, .btn-close, [data-dismiss="modal"]').click();
                        $dialogEl.closest('.modal, .o_dialog').remove();
                        $('.modal-backdrop').remove();
                        $('body').removeClass('modal-open');
                    }
                    triggerFormSaveWithExcessContext(dialogInstance);
                });

            var $okBtn = $footer.find('.btn-primary, button:first');
            if ($okBtn.length) {
                $infoBtn.insertAfter($okBtn);
            } else {
                $footer.append($infoBtn);
            }
        }
    }

    // Direct DOM observer specifically targeting modal dialogs when opened
    if (typeof MutationObserver !== 'undefined') {
        var modalObserver = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType === 1) {
                        if ($(node).hasClass('modal') || $(node).find('.modal, .o_dialog').length || $(node).hasClass('o_dialog')) {
                            var $modals = $(node).hasClass('modal') ? $(node) : $(node).find('.modal, .o_dialog');
                            $modals.each(function () {
                                attachInformationButtonToElement($(this));
                            });
                        }
                    }
                }
            }
        });

        $(document).ready(function () {
            modalObserver.observe(document.body, { childList: true, subtree: true });
        });
    }

    Dialog.include({
        init: function (parent, options) {
            options = options || {};
            var combinedText = extractText(options) + " " + extractText(parent) + " " + extractText(options.$content);
            if (isExcessStockMessage(combinedText)) {
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
                        class: 'btn-info o_excess_stock_info_btn',
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
                attachInformationButtonToElement(self.$el, self);
            });
        }
    });

    CrashManager.include({
        show_warning: function (error) {
            if (error && isExcessStockMessage(extractText(error))) {
                var self = this;
                var dialog = new Dialog(this, {
                    title: (error && error.data && error.data.title) || (error && error.title) || _t("User Error"),
                    $content: $('<div>').text(_t("Jumlah Kuantitas Yang Diinput Melebihi Stok")),
                    buttons: [
                        { text: _t("Ok"), class: 'btn-primary', close: true },
                        {
                            text: _t("Information"),
                            class: 'btn-info o_excess_stock_info_btn',
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
        show_error: function (error) {
            if (error && isExcessStockMessage(extractText(error))) {
                return this.show_warning(error);
            }
            return this._super.apply(this, arguments);
        }
    });
});
