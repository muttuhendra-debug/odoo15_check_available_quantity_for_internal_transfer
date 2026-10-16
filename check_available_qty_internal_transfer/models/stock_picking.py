from odoo import models, _
from odoo.exceptions import UserError


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    def button_validate(self):
        for picking in self:
            if picking.picking_type_id and picking.picking_type_id.code == 'internal':
                for line in picking.move_line_ids:
                    if line.qty_done > line.available_qty:
                        raise UserError(_("Jumlah Kuantitas Yang Diinput Melebihi Stok"))
        return super(StockPicking, self).button_validate()
