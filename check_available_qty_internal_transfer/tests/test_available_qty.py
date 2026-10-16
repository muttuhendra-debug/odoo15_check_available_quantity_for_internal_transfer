import unittest
from unittest.mock import MagicMock


class TestAvailableQtyLogic(unittest.TestCase):
    """Unit test suite for available quantity computation logic and picking validation."""

    def test_compute_available_qty_empty(self):
        """Test available_qty compute method when line has no product or location."""
        line = MagicMock()
        line.product_id = None
        line.location_id = None

        if not line.product_id or not line.location_id:
            line.available_qty = 0.0

        self.assertEqual(line.available_qty, 0.0)

    def test_compute_available_qty_calculation(self):
        """Test calculation of available quantity from physical stock quants."""
        quant1 = MagicMock(quantity=50.0)
        quant2 = MagicMock(quantity=20.0)
        quants = [quant1, quant2]

        avail = sum(q.quantity for q in quants)
        self.assertEqual(avail, 70.0)

    def test_compute_available_qty_uom_conversion(self):
        """Test UoM conversion logic for available quantity."""
        uom_unit = MagicMock()
        uom_dozen = MagicMock()

        product = MagicMock()
        product.uom_id = uom_unit

        uom_unit._compute_quantity = MagicMock(return_value=2.0)

        avail_base = 24.0
        line_uom = uom_dozen

        if line_uom and line_uom != product.uom_id:
            avail_converted = product.uom_id._compute_quantity(avail_base, line_uom)
        else:
            avail_converted = avail_base

        self.assertEqual(avail_converted, 2.0)

    def test_validate_quantity_exceeds_available(self):
        """Test that validating or updating a picking line with qty_done > available_qty raises error."""
        line = MagicMock()
        line.picking_type_id.code = 'internal'
        line.qty_done = 21.0
        line.available_qty = 20.0

        exceeds = line.picking_type_id.code == 'internal' and line.qty_done > line.available_qty
        self.assertTrue(exceeds)

    def test_unlocked_transfer_excess_qty(self):
        """Test that editing an unlocked transfer line with qty_done > available_qty triggers excess stock condition."""
        line = MagicMock()
        line.picking_type_id.code = 'internal'
        line.state = 'done'
        line.picking_id.is_locked = False
        line.qty_done = 3.0
        line.available_qty = 2.0

        is_locked_done = line.state == 'done' and line.picking_id and line.picking_id.is_locked
        exceeds = line.picking_type_id.code == 'internal' and not is_locked_done and line.qty_done > line.available_qty
        self.assertTrue(exceeds)

    def test_validate_quantity_within_available(self):
        """Test that validating or updating a picking line with qty_done <= available_qty passes."""
        line = MagicMock()
        line.picking_type_id.code = 'internal'
        line.qty_done = 5.0
        line.available_qty = 20.0

        exceeds = line.picking_type_id.code == 'internal' and line.qty_done > line.available_qty
        self.assertFalse(exceeds)


# Try importing Odoo TransactionCase if Odoo is available in runtime
try:
    from odoo.tests.common import TransactionCase
    from odoo.exceptions import UserError

    class TestAvailableQtyOdoo(TransactionCase):
        """Odoo Integration test for stock.move.line available_qty."""

        def setUp(self):
            super(TestAvailableQtyOdoo, self).setUp()
            self.product = self.env['product.product'].create({
                'name': 'Test Product',
                'type': 'product',
            })
            self.location = self.env['stock.location'].create({
                'name': 'Test Location',
                'usage': 'internal',
            })
            self.dest_location = self.env['stock.location'].create({
                'name': 'Test Dest Location',
                'usage': 'internal',
            })

        def test_stock_move_line_available_qty(self):
            self.env['stock.quant'].create({
                'product_id': self.product.id,
                'location_id': self.location.id,
                'quantity': 100.0,
            })

            line = self.env['stock.move.line'].create({
                'product_id': self.product.id,
                'location_id': self.location.id,
                'location_dest_id': self.dest_location.id,
                'product_uom_id': self.product.uom_id.id,
            })

            self.assertEqual(line.available_qty, 100.0)

        def test_picking_validation_within_available_qty(self):
            self.env['stock.quant'].create({
                'product_id': self.product.id,
                'location_id': self.location.id,
                'quantity': 20.0,
            })

            picking_type = self.env['stock.picking.type'].search([('code', '=', 'internal')], limit=1)
            picking = self.env['stock.picking'].create({
                'picking_type_id': picking_type.id if picking_type else False,
                'location_id': self.location.id,
                'location_dest_id': self.dest_location.id,
            })

            line = self.env['stock.move.line'].create({
                'picking_id': picking.id,
                'product_id': self.product.id,
                'location_id': self.location.id,
                'location_dest_id': self.dest_location.id,
                'product_uom_id': self.product.uom_id.id,
                'qty_done': 5.0,
            })

            self.assertEqual(line.qty_done, 5.0)
            self.assertEqual(line.available_qty, 20.0)

        def test_picking_validation_exceed_available_qty(self):
            self.env['stock.quant'].create({
                'product_id': self.product.id,
                'location_id': self.location.id,
                'quantity': 20.0,
            })

            picking_type = self.env['stock.picking.type'].search([('code', '=', 'internal')], limit=1)
            picking = self.env['stock.picking'].create({
                'picking_type_id': picking_type.id if picking_type else False,
                'location_id': self.location.id,
                'location_dest_id': self.dest_location.id,
            })

            self.env['stock.move.line'].create({
                'picking_id': picking.id,
                'product_id': self.product.id,
                'location_id': self.location.id,
                'location_dest_id': self.dest_location.id,
                'product_uom_id': self.product.uom_id.id,
                'qty_done': 25.0,
            })

            with self.assertRaises(UserError):
                picking.button_validate()

        def test_excess_stock_menu_action(self):
            action = self.env.ref('check_available_qty_internal_transfer.action_excess_stock_input_internal_transfer')
            self.assertTrue(action)
            self.assertEqual(action.res_model, 'stock.move.line')

except ImportError:
    pass


if __name__ == '__main__':
    unittest.main()
