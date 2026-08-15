// Meta Webhook Verification (Meta verify karne ke liye is URL ko call karega)
app.get('/api/webhooks/meta', (req, res) => {
  const VERIFY_TOKEN = 'my_crm_secret_token_123'; // Aapka custom token

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Meta Lead Receiving Endpoint (Automatic Lead Add Hoga)
app.post('/api/webhooks/meta', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach((entry) => {
      entry.changes.forEach((change) => {
        if (change.field === 'leadgen') {
          const leadData = change.value;
          const leadId = 'fb_' + leadData.leadgen_id;
          
          // Meta Form Data Parse & DB Insertion
          db.run(
            `INSERT INTO Leads (id, broker_id, client_name, client_phone, source, location, budget, status)
             VALUES (?, 'b101', ?, ?, 'Meta Ads', ?, ?, 'Unassigned')`,
            [
              leadId,
              leadData.field_data?.name || 'FB Lead',
              leadData.field_data?.phone || 'N/A',
              leadData.field_data?.city || 'Noida',
              leadData.field_data?.budget || '50L-1Cr'
            ],
            (err) => {
              if (!err) console.log('Meta Lead Inserted Automatically!');
            }
          );
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});
