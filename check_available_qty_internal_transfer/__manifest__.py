{
    'name': 'Check Available Quantity for Internal Transfer',
    'version': '15.0.1.0.0',
    'category': 'Inventory/Inventory',
    'summary': 'Display available quantity of products in internal transfers / stock detailed operations',
    'description': """
Check Available Quantity for Internal Transfer
===============================================
This module adds an Available QTY column in internal transfer move lines (stock.move.line)
placed after the Lot/Serial Number column to show product available stock at source location.
    """,
    'author': 'Kalawai Mart',
    'website': 'https://www.kalawai.com',
    'license': 'LGPL-3',
    'depends': ['stock'],
    'data': [
        'views/stock_picking_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
