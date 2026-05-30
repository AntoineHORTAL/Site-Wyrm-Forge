-- DEFAULT 'user' sur profiles.role — ceinture côté DB.
-- Le callback envoie déjà role: 'user' explicitement (bretelles côté code),
-- mais sans ce DEFAULT la policy RESTRICTIVE bloquait tout INSERT sans champ role.
ALTER TABLE profiles
  ALTER COLUMN role SET DEFAULT 'user';
