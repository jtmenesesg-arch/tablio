-- Clean up all test orders and related data
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM table_sessions;

-- Reset tables to free status
UPDATE tables SET status = 'free', assigned_waiter_id = NULL;

-- Reset menu item counters
UPDATE menu_items SET total_orders = 0;