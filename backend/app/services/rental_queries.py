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
        (SELECT COUNT(*) FROM equipment_listings WHERE owner_id = :user_id AND is_active = false) AS inactive_listings,
        (SELECT COUNT(*) FROM equipment_bookings WHERE owner_id = :user_id) AS bookings_given,
        (SELECT COUNT(*) FROM equipment_bookings WHERE renter_id = :user_id) AS bookings_taken,
        (
            SELECT COUNT(*)
            FROM equipment_bookings
            WHERE owner_id = :user_id
              AND status = 'pending'
        ) AS pending_requests,
        (
            SELECT COUNT(*)
            FROM equipment_bookings
            WHERE renter_id = :user_id
              AND status IN ('pending', 'approved')
              AND end_datetime >= NOW()
        ) AS upcoming_bookings,
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
        specifications,
        price,
        price_type,
        image_url,
        image_public_id,
        latitude,
        longitude
    )
    VALUES (
        :owner_id,
        :block_id,
        :equipment_name,
        :description,
        CAST(:specifications AS JSONB),
        :price,
        :price_type,
        :image_url,
        :image_public_id,
        :latitude,
        :longitude
    )
    RETURNING
        id,
        owner_id,
        block_id,
        equipment_name,
        description,
        specifications,
        price,
        price_type,
        image_url,
        image_public_id,
        latitude,
        longitude,
        is_active,
        created_at
    """
)


LIST_LISTINGS_SQL = text(
    """
    SELECT
        l.id,
        l.owner_id,
        l.block_id,
        l.equipment_name,
        l.description,
        l.specifications,
        l.price,
        l.price_type,
        l.image_url,
        l.image_public_id,
        l.latitude,
        l.longitude,
        l.is_active,
        l.created_at,
        u.name AS owner_name,
        COALESCE(b.lanslu, u.farm_location, 'Unknown') AS location_label,
        (
            SELECT COUNT(*)
            FROM equipment_bookings eb
            WHERE eb.listing_id = l.id
        ) AS bookings_count,
        NULL::double precision AS distance_m
    FROM equipment_listings l
    JOIN users u ON u.id = l.owner_id
    LEFT JOIN blocks b ON b.id = l.block_id
    WHERE l.is_active = true
    ORDER BY l.created_at DESC
    """
)


LIST_LISTINGS_WITH_RADIUS_SQL = text(
    """
    SELECT
        l.id,
        l.owner_id,
        l.block_id,
        l.equipment_name,
        l.description,
        l.specifications,
        l.price,
        l.price_type,
        l.image_url,
        l.image_public_id,
        l.latitude,
        l.longitude,
        l.is_active,
        l.created_at,
        u.name AS owner_name,
        COALESCE(b.lanslu, u.farm_location, 'Unknown') AS location_label,
        (
            SELECT COUNT(*)
            FROM equipment_bookings eb
            WHERE eb.listing_id = l.id
        ) AS bookings_count,
        CASE
            WHEN :lat IS NOT NULL
              AND :lon IS NOT NULL
              AND l.latitude IS NOT NULL
              AND l.longitude IS NOT NULL
            THEN ST_Distance(
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)::geography
            )
            ELSE NULL::double precision
        END AS distance_m
    FROM equipment_listings l
    JOIN users u ON u.id = l.owner_id
    LEFT JOIN blocks b ON b.id = l.block_id
    WHERE l.is_active = true
      AND (
          :lat IS NULL
          OR :lon IS NULL
          OR (
              l.latitude IS NOT NULL
              AND l.longitude IS NOT NULL
              AND ST_DWithin(
                  ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                  ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)::geography,
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
        specifications,
        price,
        price_type,
        image_url,
        image_public_id,
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
        specifications,
        price,
        price_type,
        image_url,
        image_public_id,
        latitude,
        longitude,
        is_active,
        created_at
    """
)


UPDATE_LISTING_SQL = text(
    """
    UPDATE equipment_listings
    SET
        equipment_name = :equipment_name,
        description = :description,
        specifications = CAST(:specifications AS JSONB),
        price = :price,
        price_type = :price_type,
        block_id = :block_id,
        image_url = :image_url,
        image_public_id = :image_public_id,
        latitude = :latitude,
        longitude = :longitude
    WHERE id = :listing_id
      AND owner_id = :owner_id
    RETURNING
        id,
        owner_id,
        block_id,
        equipment_name,
        description,
        specifications,
        price,
        price_type,
        image_url,
        image_public_id,
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
        l.is_active AS listing_is_active,
        u.name AS owner_name
    FROM equipment_bookings b
    JOIN equipment_listings l ON l.id = b.listing_id
    JOIN users u ON u.id = b.owner_id
    WHERE b.renter_id = :user_id
    ORDER BY b.created_at DESC
    """
)


MY_LISTINGS_SQL = text(
    """
    SELECT
        l.id,
        l.owner_id,
        l.block_id,
        l.equipment_name,
        l.description,
        l.specifications,
        l.price,
        l.price_type,
        l.image_url,
        l.image_public_id,
        l.latitude,
        l.longitude,
        l.is_active,
        l.created_at,
        COALESCE(b.lanslu, 'Unknown') AS location_label,
        (
            SELECT COUNT(*)
            FROM equipment_bookings eb
            WHERE eb.listing_id = l.id
        ) AS bookings_count
    FROM equipment_listings l
    LEFT JOIN blocks b ON b.id = l.block_id
    WHERE l.owner_id = :user_id
    ORDER BY l.created_at DESC
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
        l.is_active AS listing_is_active,
        u.name AS renter_name
    FROM equipment_bookings b
    JOIN equipment_listings l ON l.id = b.listing_id
    JOIN users u ON u.id = b.renter_id
    WHERE b.owner_id = :user_id
    ORDER BY b.created_at DESC
    """
)


BOOKING_CONFLICT_DETAIL_SQL = text(
    """
    SELECT
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM equipment_bookings b
                WHERE b.listing_id = :listing_id
                  AND b.status IN ('pending', 'approved')
                  AND (:exclude_booking_id IS NULL OR b.id <> :exclude_booking_id)
                  AND :start_datetime < b.end_datetime
                  AND :end_datetime > b.start_datetime
            ) THEN 'overlap'
            WHEN EXISTS (
                SELECT 1
                FROM equipment_bookings b
                WHERE b.listing_id = :listing_id
                  AND b.status IN ('pending', 'approved')
                  AND (:exclude_booking_id IS NULL OR b.id <> :exclude_booking_id)
                  AND :start_datetime < (b.end_datetime + interval '1 hour')
                  AND :end_datetime > b.end_datetime
            ) THEN 'buffer'
            ELSE NULL
        END AS conflict_reason
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
