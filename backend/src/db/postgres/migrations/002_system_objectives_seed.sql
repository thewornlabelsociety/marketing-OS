-- Migration 002: System objectives seed (mirrors seedSystemObjectives() in database.ts)
-- tenant_local bootstrap is intentionally excluded — local-runtime SQLite only.

INSERT INTO objectives (
  id, workspace_id, name, description, objective_type, primary_kpi,
  supporting_kpis, conversion_event, success_criteria, default_channels,
  is_system, is_active
) VALUES
  ('obj_sys_sales', NULL, 'Sales', 'Drive direct product or service purchases.', 'SALES', 'conversions', '["revenue","reach"]', NULL, NULL, '["instagram","email"]', 1, 1),
  ('obj_sys_lead_gen', NULL, 'Lead Generation', 'Collect qualified leads for the sales pipeline.', 'LEAD_GENERATION', 'leads', '["website_clicks","conversions"]', NULL, NULL, '["instagram","email","facebook"]', 1, 1),
  ('obj_sys_traffic', NULL, 'Traffic', 'Drive website visits or landing page clicks.', 'TRAFFIC', 'website_clicks', '["reach","ctr"]', NULL, NULL, '["instagram","facebook"]', 1, 1),
  ('obj_sys_awareness', NULL, 'Awareness', 'Expand brand reach to new audiences.', 'AWARENESS', 'reach', '["impressions","new_followers"]', NULL, NULL, '["instagram","tiktok","facebook"]', 1, 1),
  ('obj_sys_engagement', NULL, 'Engagement', 'Build audience connection and community interaction.', 'ENGAGEMENT', 'engagement_rate', '["saves","comments","shares"]', NULL, NULL, '["instagram","tiktok"]', 1, 1),
  ('obj_sys_launch', NULL, 'Product / Service Launch', 'Introduce a new product or service to market.', 'LAUNCH', 'launch_conversions', '["reach","website_clicks"]', NULL, NULL, '["instagram","email","facebook"]', 1, 1),
  ('obj_sys_event', NULL, 'Event Promotion', 'Drive ticket sales, RSVPs, or event attendance.', 'EVENT_PROMOTION', 'rsvps_or_tickets', '["reach","website_clicks"]', NULL, NULL, '["instagram","email","facebook"]', 1, 1),
  ('obj_sys_email_growth', NULL, 'Email List Growth', 'Grow the newsletter or email subscriber base.', 'EMAIL_LIST_GROWTH', 'new_subscribers', '["website_clicks","conversions"]', NULL, NULL, '["instagram","facebook"]', 1, 1),
  ('obj_sys_retention', NULL, 'Customer Retention', 'Re-purchase and loyalty from existing customers.', 'RETENTION', 'repeat_purchases', '["revenue","conversions"]', NULL, NULL, '["email","sms"]', 1, 1),
  ('obj_sys_reengagement', NULL, 'Re-engagement', 'Bring lapsed customers or followers back to active status.', 'RE_ENGAGEMENT', 'reactivated_customers', '["clicks","conversions"]', NULL, NULL, '["email","instagram"]', 1, 1),
  ('obj_sys_education', NULL, 'Education', 'Teach the audience something that builds trust or demand.', 'EDUCATION', 'content_completions', '["saves","shares","watch_time"]', NULL, NULL, '["instagram","tiktok","email"]', 1, 1),
  ('obj_sys_community', NULL, 'Community Growth', 'Increase follower count or community membership.', 'COMMUNITY_GROWTH', 'new_followers', '["reach","engagement_rate"]', NULL, NULL, '["instagram","tiktok","facebook"]', 1, 1),
  ('obj_sys_clearance', NULL, 'Inventory Clearance', 'Move excess or expiring stock at volume.', 'INVENTORY_CLEARANCE', 'units_sold', '["revenue","conversions"]', NULL, NULL, '["email","instagram","sms"]', 1, 1)
ON CONFLICT (id) DO NOTHING;
