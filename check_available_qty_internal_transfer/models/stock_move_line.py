from odoo import api, fields, models, _
from odoo.exceptions import UserError


class StockMoveLine(models.Model):
    _inherit = 'stock.move.line'

    product_barcode = fields.Char(
        string='Barcode',
        related='product_id.barcode',
        readonly=True,
    )

    available_qty = fields.Float(
        string='Available QTY',
        compute='_compute_available_qty',
        digits='Product Unit of Measure',
        help='Available stock quantity of the product at the source location.',
    )

    is_excess_stock = fields.Boolean(
        string='Is Excess Stock Input',
        compute='_compute_is_excess_stock',
        search='_search_is_excess_stock',
        help='Indicates if the done quantity exceeds the available quantity for internal transfers.',
    )

    @api.depends('product_id', 'location_id', 'lot_id', 'product_uom_id', 'qty_done', 'product_uom_qty', 'state')
    def _compute_available_qty(self):
        valid_lines = []
        for line in self:
            if not line.product_id:
                line.available_qty = 0.0
                continue
            code = (
                (line.picking_type_id and line.picking_type_id.code)
                or (line.picking_id and line.picking_id.picking_type_id and line.picking_id.picking_type_id.code)
            )
            if code and code != 'internal':
                line.available_qty = 0.0
                continue
            valid_lines.append(line)

        if not valid_lines:
            return

        product_ids = list({l.product_id.id for l in valid_lines if l.product_id.id})
        loc_ids = list({
            (l.location_id.id or (l.picking_id and l.picking_id.location_id and l.picking_id.location_id.id))
            for l in valid_lines
            if l.location_id or (l.picking_id and l.picking_id.location_id)
        })
        domain = [('product_id', 'in', product_ids)]
        if loc_ids:
            domain.append(('location_id', 'child_of', loc_ids))

        quants = self.env['stock.quant'].search(domain) if product_ids else []

        for line in valid_lines:
            product = line.product_id
            if product.type != 'product':
                line.available_qty = 999999.0
                continue

            loc = line.location_id or (line.picking_id and line.picking_id.location_id)
            if not loc:
                line.available_qty = 0.0
                continue

            loc_rec = loc._origin if getattr(loc, '_origin', False) else loc
            lot_rec = line.lot_id._origin if line.lot_id and getattr(line.lot_id, '_origin', False) else line.lot_id

            line_quants = [q for q in quants if q.product_id.id == product.id]
            if loc_rec and loc_rec.id:
                line_quants = [
                    q for q in line_quants
                    if q.location_id.id == loc_rec.id or (q.location_id.parent_path or '').startswith(loc_rec.parent_path or '')
                ]

            if lot_rec and lot_rec.id:
                lot_quants = [q for q in line_quants if q.lot_id and q.lot_id.id == lot_rec.id]
                avail = sum(q.quantity for q in lot_quants)
            else:
                avail = sum(q.quantity for q in line_quants)

            if line.state == 'done':
                initial_done = line._origin.qty_done if line._origin and line._origin.qty_done else 0.0
                if line.product_uom_id and line.product_uom_id != product.uom_id:
                    initial_done = line.product_uom_id._compute_quantity(initial_done, product.uom_id)
                avail += initial_done

            if line.product_uom_id and line.product_uom_id != product.uom_id:
                avail = product.uom_id._compute_quantity(avail, line.product_uom_id)

            line.available_qty = avail

    @api.constrains('qty_done', 'location_id', 'product_id', 'lot_id', 'state')
    def _check_available_qty_limit(self):
        if self.env.context.get('skip_excess_check'):
            return
        for line in self:
            if line.state == 'cancel':
                continue
            if line.state == 'done' and line.picking_id and line.picking_id.is_locked:
                continue
            code = (
                (line.picking_type_id and line.picking_type_id.code)
                or (line.picking_id and line.picking_id.picking_type_id and line.picking_id.picking_type_id.code)
            )
            if code == 'internal' and line.qty_done > 0:
                if line.qty_done > line.available_qty:
                    raise UserError(_("Jumlah Kuantitas Yang Diinput Melebihi Stok"))

    @api.depends('qty_done', 'available_qty', 'picking_type_id.code', 'picking_id.picking_type_id.code', 'state', 'picking_id.is_locked')
    def _compute_is_excess_stock(self):
        for line in self:
            code = (
                (line.picking_type_id and line.picking_type_id.code)
                or (line.picking_id and line.picking_id.picking_type_id and line.picking_id.picking_type_id.code)
            )
            is_locked_done = line.state == 'done' and line.picking_id and line.picking_id.is_locked
            line.is_excess_stock = bool(
                code == 'internal' and line.state != 'cancel' and not is_locked_done and line.qty_done > line.available_qty
            )

    def _search_is_excess_stock(self, operator, value):
        domain = [
            ('picking_id.picking_type_id.code', '=', 'internal'),
            ('qty_done', '>', 0),
            ('state', 'in', ('assigned', 'confirmed', 'draft', 'waiting', 'done')),
            ('product_id.type', '=', 'product'),
        ]
        candidate_lines = self.env['stock.move.line'].search(domain)
        excess_ids = candidate_lines.filtered(
            lambda l: not (l.state == 'done' and l.picking_id and l.picking_id.is_locked) and l.qty_done > l.available_qty
        ).ids

        positive = (operator in ('=', '==') and value) or (operator == '!=' and not value)
        if positive:
            return [('id', 'in', excess_ids)]
        else:
            return [('id', 'not in', excess_ids)]
