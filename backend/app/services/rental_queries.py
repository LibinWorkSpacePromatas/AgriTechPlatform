from sqlalchemy import text


CHECK_USER_EXISTS_SQL = text(
    """
    SELECT 1
    FROM users
    WHERE id = :user_id
    """
)

DASHBOARD_SQL = text(
    """
    SELECT
        (SELECT COUNT(*) FROM equipment_listings WHERE owner_id = :user_id) AS total_listings,
        (SELECT COUNT(*) FROM equipment_listings WHERE owner_id = :user_id AND is_active = true) AS active_listings,
        (SELECT COUNT(*) FROM equipment_bookings WHERE owner_id = :user_id) AS bookings_given,
        (SELECT COUNT(*) FROM equipment_bookings WHERE renter_id = :user_id) AS bookings_taken,
        COALESCE(
            (
                SELECT SUM(total_price)
                FROM equipment_bookings
                WHERE owner_id = :user_id
                  AND status IN ('approved', 'completed')
            ),
            0
        ) AS revenue
    """
)


CHECK_BLOCK_OWNERSHIP_SQL = text(
    """
    SELECT 1
    FROM blocks
    WHERE id = :block_id
      AND user_id = :user_id
    """
)

BLOCK_CENTROID_SQL = text(
    """
    SELECT
        ST_Y(ST_Centroid(geom)) AS latitude,
        ST_X(ST_Centroid(geom)) AS longitude
    FROM blocks
    WHERE id = :block_id
    """
)


INSERT_LISTING_SQL = text(
    """
    INSERT INTO equipment_listings (
        owner_id,
        block_id,
        equipment_name,
        description,
        price,
        price_type,
        latitude,
        longitude
    )
    VALUES (
        :owner_id,
        :block_id,
        :equipment_name,
        :description,
        :price,
        :price_type,
        :latitude,
        :longitude
    )
    RETURNING
        id,
        owner_id,
        block_id,
        equipment_name,
        description,
        price,
        price_type,
        latitude,
        longitude,
        is_active,
        created_at
    """
)


LIST_LISTINGS_SQL = text(
    """
    SELECT
        id,
        owner_id,
        block_id,
        equipment_name,
        description,
        price,
        price_type,
        latitude,
        longitude,
        is_active,
        created_at,
        NULL::double precision AS distance_m
    FROM equipment_listings
    WHERE is_active = true
    ORDER BY created_at DESC
    """
)


LIST_LISTINGS_WITH_RADIUS_SQL = text(
    """
    SELECT
        id,
        owner_id,
        block_id,
        equipment_name,
        description,
        price,
        price_type,
        latitude,
        longitude,
        is_active,
        created_at,
        CASE
            WHEN :lat IS NOT NULL
              AND :lon IS NOT NULL
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            THEN ST_Distance(
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
            )
            ELSE NULL::double precision
        END AS distance_m
    FROM equipment_listings
    WHERE is_active = true
      AND (
          :lat IS NULL
          OR :lon IS NULL
          OR (
              latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND ST_DWithin(
                  ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                  :radius_in_meters
              )
          )
      )
    ORDER BY distance_m ASC NULLS LAST, created_at DESC
    """
)


SELECT_LISTING_SQL = text(
    """
    SELECT
        id,
        owner_id,
        block_id,
        equipment_name,
        description,
        price,
        price_type,
        latitude,
        longitude,
        is_active,
        created_at
    FROM equipment_listings
    WHERE id = :listing_id
    """
)


TOGGLE_LISTING_SQL = text(
    """
    UPDATE equipment_listings
    SET is_active = NOT is_active
    WHERE id = :listing_id
      AND owner_id = :owner_id
    RETURNING
        id,
        owner_id,
        block_id,
        equipment_name,
        description,
        price,
        price_type,
        latitude,
        longitude,
        is_active,
        created_at
    """
)


BOOKING_CONFLICT_SQL = text(
    """
    SELECT 1
    FROM equipment_bookings
    WHERE listing_id = :listing_id
      AND status IN ('pending', 'approved')
      AND (:exclude_booking_id IS NULL OR id <> :exclude_booking_id)
      AND (
          :start_datetime < (end_datetime + interval '1 hour')
          AND :end_datetime > start_datetime
      )
    LIMIT 1
    """
)


INSERT_BOOKING_SQL = text(
    """
    INSERT INTO equipment_bookings (
        listing_id,
        renter_id,
        owner_id,
        start_datetime,
        end_datetime,
        status,
        total_price
    )
    VALUES (
        :listing_id,
        :renter_id,
        :owner_id,
        :start_datetime,
        :end_datetime,
        'pending',
        :total_price
    )
    RETURNING
        id,
        listing_id,
        renter_id,
        owner_id,
        start_datetime,
        end_datetime,
        status,
        total_price,
        created_at
    """
)


SELECT_BOOKING_SQL = text(
    """
    SELECT
        id,
        listing_id,
        renter_id,
        owner_id,
        start_datetime,
        end_datetime,
        status,
        total_price,
        created_at
    FROM equipment_bookings
    WHERE id = :booking_id
    """
)


UPDATE_BOOKING_STATUS_SQL = text(
    """
    UPDATE equipment_bookings
    SET status = :status
    WHERE id = :booking_id
    RETURNING
        id,
        listing_id,
        renter_id,
        owner_id,
        start_datetime,
        end_datetime,
        status,
        total_price,
        created_at
    """
)


MY_BOOKINGS_SQL = text(
    """
    SELECT
        b.id,
        b.listing_id,
        b.renter_id,
        b.owner_id,
        b.start_datetime,
        b.end_datetime,
        b.status,
        b.total_price,
        b.created_at,
        l.equipment_name,
        l.is_active AS listing_is_active
    FROM equipment_bookings b
    JOIN equipment_listings l ON l.id = b.listing_id
    WHERE b.renter_id = :user_id
    ORDER BY b.created_at DESC
    """
)


MY_LISTINGS_SQL = text(
    """
    SELECT
        id,
        owner_id,
        block_id,
        equipment_name,
        description,
        price,
        price_type,
        latitude,
        longitude,
        is_active,
        created_at
    FROM equipment_listings
    WHERE owner_id = :user_id
    ORDER BY created_at DESC
    """
)


MY_REQUESTS_SQL = text(
    """
    SELECT
        b.id,
        b.listing_id,
        b.renter_id,
        b.owner_id,
        b.start_datetime,
        b.end_datetime,
        b.status,
        b.total_price,
        b.created_at,
        l.equipment_name,
        l.is_active AS listing_is_active
    FROM equipment_bookings b
    JOIN equipment_listings l ON l.id = b.listing_id
    WHERE b.owner_id = :user_id
    ORDER BY b.created_at DESC
    """
)


INSERT_PAYMENT_SQL = text(
    """
    INSERT INTO equipment_payments (
        booking_id,
        amount,
        status
    )
    VALUES (
        :booking_id,
        :amount,
        'paid'
    )
    RETURNING
        id,
        booking_id,
        amount,
        status,
        created_at
    """
)


LISTING_CALENDAR_SLOTS_SQL = text(
    """
    WITH slots AS (
        SELECT
            gs AS slot_start,
            gs + interval '1 hour' AS slot_end
        FROM generate_series(
            :day_start::timestamptz,
            (:day_start::timestamptz + interval '23 hour'),
            interval '1 hour'
        ) AS gs
    )
    SELECT
        slot_start,
        slot_end,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM equipment_bookings b
                WHERE b.listing_id = :listing_id
                  AND b.status IN ('pending', 'approved', 'completed')
                  AND slot_start < b.end_datetime
                  AND slot_end > b.start_datetime
            ) THEN 'booked'
            WHEN EXISTS (
                SELECT 1
                FROM equipment_bookings b
                WHERE b.listing_id = :listing_id
                  AND b.status IN ('pending', 'approved', 'completed')
                  AND slot_start < (b.end_datetime + interval '1 hour')
                  AND slot_end > b.end_datetime
            ) THEN 'buffer'
            ELSE 'available'
        END AS status
    FROM slots
    ORDER BY slot_start
    """
)
