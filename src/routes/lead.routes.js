const express = require('express');
const router = express.Router();
const { getLeads, createLead, updateLeadStatus } = require('../controllers/lead.controller');

router.route('/')
    .get(getLeads)
    .post(createLead);

router.route('/:id/status')
    .put(updateLeadStatus);

module.exports = router;
