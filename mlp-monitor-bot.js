const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// Enable JSON body parsing
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Set AUTO_FIX_ENABLED to true
const AUTO_FIX_ENABLED = true;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Other existing code below...
// ...