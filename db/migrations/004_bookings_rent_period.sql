-- Вся аренда в одной таблице bookings; сутки — через rent_period = 'day'.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rent_period TEXT,
  ADD COLUMN IF NOT EXISTS check_in_date DATE,
  ADD COLUMN IF NOT EXISTS check_out_date DATE,
  ADD COLUMN IF NOT EXISTS nights_count INTEGER;

DO $$
BEGIN
  IF to_regclass('public.daily_rent_bookings') IS NOT NULL THEN
    UPDATE bookings b
    SET
      rent_period = 'day',
      check_in_date = d.check_in_date,
      check_out_date = d.check_out_date,
      nights_count = d.nights_count
    FROM daily_rent_bookings d
    WHERE b.id = d.booking_id
      AND b.rent_period IS NULL;

    DROP TABLE daily_rent_bookings;
  END IF;
END $$;
