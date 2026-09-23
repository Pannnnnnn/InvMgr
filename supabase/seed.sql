-- Optional sample catalog data for local testing.
-- Run manually against your Supabase project (SQL editor, or psql) after
-- the migrations have been applied. Not run automatically by db:migrate.

insert into items (sku, name, category, aliases, total_quantity, available_quantity) values
  ('TRQ-001', '1/2" Drive Torque Wrench', 'Hand Tools', array['torque wrench', 'torque wrenches'], 5, 5),
  ('DRL-018V', '18V Cordless Hammer Drill', 'Power Tools', array['drill', 'makita drill', 'makita cordless', 'cordless impact drill', 'hammer drill'], 8, 8),
  ('MM-101', 'Digital Multimeter', 'Test Equipment', array['multimeter', 'multi meter', 'DMM'], 6, 6),
  ('WLD-HLM', 'Welding Helmet', 'Safety Gear', array['welding mask', 'welder helmet'], 4, 4),
  ('GRD-4IN', '4" Angle Grinder', 'Power Tools', array['angle grinder', 'grinder'], 3, 3)
on conflict (sku) do nothing;
