-- Seed sample data for TravelMap application

-- Insert sample users
INSERT INTO users (id, email, first_name, last_name, user_type, is_verified) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'john.viewer@example.com', 'John', 'Doe', 'viewer', true),
('550e8400-e29b-41d4-a716-446655440002', 'adventure.seeker@example.com', 'Alex', 'Johnson', 'creator', true),
('550e8400-e29b-41d4-a716-446655440003', 'euro.explorer@example.com', 'Maria', 'Garcia', 'creator', true),
('550e8400-e29b-41d4-a716-446655440004', 'admin@travelmap.com', 'Admin', 'User', 'admin', true);

-- Insert creator profiles
INSERT INTO creator_profiles (user_id, channel_name, channel_url, subscriber_count, monthly_views, travel_content_percentage, bio, verification_status) VALUES
('550e8400-e29b-41d4-a716-446655440002', 'AdventureSeeker', 'https://youtube.com/@adventureseeker', 125000, 500000, 85, 'Exploring the world one adventure at a time! Join me on epic road trips and outdoor adventures across America and beyond.', 'approved'),
('550e8400-e29b-41d4-a716-446655440003', 'EuroExplorer', 'https://youtube.com/@euroexplorer', 89000, 300000, 90, 'Your guide to backpacking through Europe on a budget. Discover hidden gems and local experiences across the continent.', 'approved');

-- Insert sample videos
INSERT INTO videos (id, creator_id, title, youtube_id, description, duration, status, view_count, map_view_count, like_count) VALUES
('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'Epic Road Trip: New York to Los Angeles', 'dQw4w9WgXcQ', 'Join me on an incredible cross-country road trip adventure spanning 2,800 miles across America!', 2732, 'published', 125000, 89000, 3200),
('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003', 'Backpacking Through Europe: 30 Days, 15 Countries', 'dQw4w9WgXcQ', 'The ultimate European backpacking adventure with interactive maps!', 4365, 'published', 89000, 67000, 2800),
('660e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440002', 'Island Hopping in Southeast Asia', 'dQw4w9WgXcQ', 'Discover paradise as we hop between tropical islands!', 2301, 'published', 67000, 45000, 1900);

-- Insert keyframes for the road trip video
INSERT INTO video_keyframes (video_id, timestamp_seconds, latitude, longitude, location_name, description) VALUES
('660e8400-e29b-41d4-a716-446655440001', 0, 40.7128, -74.0060, 'New York City', 'Starting our journey in the Big Apple!'),
('660e8400-e29b-41d4-a716-446655440001', 300, 40.7589, -73.9851, 'Times Square', 'Last stop in NYC before hitting the road'),
('660e8400-e29b-41d4-a716-446655440001', 600, 41.8781, -87.6298, 'Chicago', 'Windy City pit stop for deep dish pizza'),
('660e8400-e29b-41d4-a716-446655440001', 1200, 39.7392, -104.9903, 'Denver', 'Mile High City with stunning mountain views'),
('660e8400-e29b-41d4-a716-446655440001', 1800, 36.1699, -115.1398, 'Las Vegas', 'Bright lights and desert landscapes'),
('660e8400-e29b-41d4-a716-446655440001', 2400, 34.0522, -118.2437, 'Los Angeles', 'Finally made it to the City of Angels!');

-- Insert keyframes for the Europe video
INSERT INTO video_keyframes (video_id, timestamp_seconds, latitude, longitude, location_name, description) VALUES
('660e8400-e29b-41d4-a716-446655440002', 0, 51.5074, -0.1278, 'London', 'Starting the European adventure in London'),
('660e8400-e29b-41d4-a716-446655440002', 600, 48.8566, 2.3522, 'Paris', 'City of Light and amazing croissants'),
('660e8400-e29b-41d4-a716-446655440002', 1200, 52.5200, 13.4050, 'Berlin', 'Rich history and vibrant culture'),
('660e8400-e29b-41d4-a716-446655440002', 1800, 50.0755, 14.4378, 'Prague', 'Fairy tale architecture and great beer'),
('660e8400-e29b-41d4-a716-446655440002', 2400, 48.2082, 16.3738, 'Vienna', 'Imperial palaces and classical music');

-- Insert keyframes for the Southeast Asia video
INSERT INTO video_keyframes (video_id, timestamp_seconds, latitude, longitude, location_name, description) VALUES
('660e8400-e29b-41d4-a716-446655440003', 0, 13.7563, 100.5018, 'Bangkok', 'Starting in the bustling capital of Thailand'),
('660e8400-e29b-41d4-a716-446655440003', 400, 7.8804, 98.3923, 'Phuket', 'Beautiful beaches and crystal clear waters'),
('660e8400-e29b-41d4-a716-446655440003', 800, -8.3405, 115.0920, 'Bali', 'Island paradise with stunning temples'),
('660e8400-e29b-41d4-a716-446655440003', 1200, 14.5995, 120.9842, 'Manila', 'Gateway to the Philippines'),
('660e8400-e29b-41d4-a716-446655440003', 1600, 11.9804, 121.9189, 'Boracay', 'White sand beaches and turquoise waters');

-- Insert some user favorites
INSERT INTO user_favorites (user_id, video_id) VALUES
('550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001'),
('550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440002');

-- Insert some video views
INSERT INTO video_views (user_id, video_id, view_type, watch_duration) VALUES
('550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', 'video', 2732),
('550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', 'map', 1800),
('550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440002', 'video', 3000);
