module.exports = async function handler(req, res) {

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            name,
            email,
            harvest_special,
            item_1,
            item_2,
            item_3,
            item_4,
            dietary_notes,
            venmo_confirmed,
            total_cost,
        } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        const row = {
            name,
            email,
            harvest_special: harvest_special || false,
            item_1:          item_1 || null,
            item_2:          item_2 || null,
            item_3:          item_3 || null,
            item_4:          item_4 || null,
            dietary_notes:   dietary_notes || null,
            venmo_confirmed: venmo_confirmed || false,
            total_cost:      total_cost || 0,
        };

        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ties2_orders`, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'apikey':        process.env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
                'Prefer':        'return=minimal',
            },
            body: JSON.stringify(row),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Supabase error:', errorText);
            return res.status(500).json({ error: 'Failed to save order' });
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error('Handler error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};
