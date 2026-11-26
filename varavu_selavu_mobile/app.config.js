const { applyFirebase, resolveFirebase } = require('./firebaseConfig');

// app.json stays the base. Firebase is added only for an explicit qa/production analytics build (see firebaseConfig.js).
module.exports = ({ config }) => applyFirebase(config, resolveFirebase(process.env));
