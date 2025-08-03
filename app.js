require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const dateTime = require('node-datetime');
const axios = require('axios');

const app = express();

// MongoDB connection
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Schema
const shopSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  ownerName: { type: String, required: true },
  contactNumber: { type: String, required: true },
  shopNumber: { type: String, required: true },
  address: { type: String, required: true },
  description: { type: String, required: true },
  photo: { type: String, default: '' },
  timestamp: { type: String, required: true },
  location: {
    latitude: { type: String, required: true },
    longitude: { type: String, required: true },
    placeName: { type: String, default: 'Unknown location' },
  },
});
const Shop = mongoose.model('Shop', shopSchema);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Geolocation → Place name
async function getPlaceName(latitude, longitude) {
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
        zoom: 10,
      },
      headers: {
        'User-Agent': 'flutterflow-backend/1.0 (your-email@example.com)',
      },
    });
    return res.data.display_name || 'Unknown location';
  } catch (err) {
    console.error('Reverse geocoding failed:', err.message);
    return 'Unknown location';
  }
}

//
// REST API Routes for FlutterFlow
//

// Get all shops
app.get('/api/shops', async (req, res) => {
  try {
    const shops = await Shop.find();
    res.json(shops);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

// Get single shop by ID
app.get('/api/shops/:id', async (req, res) => {
  try {
    const shop = await Shop.findOne({ id: req.params.id });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json(shop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shop' });
  }
});

// Create new shop
app.post('/api/shops', upload.single('photo'), async (req, res) => {
  try {
    const { ownerName, contactNumber, shopNumber, address, description, latitude, longitude } = req.body;
    const placeName = await getPlaceName(latitude, longitude);
    const dt = dateTime.create();

    const shop = new Shop({
      id: uuidv4(),
      ownerName,
      contactNumber,
      shopNumber,
      address,
      description,
      photo: req.file ? `/uploads/${req.file.filename}` : '',
      timestamp: dt.format('Y-m-d H:M:S'),
      location: { latitude, longitude, placeName },
    });

    await shop.save();
    res.status(201).json(shop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create shop' });
  }
});

// Update shop
app.put('/api/shops/:id', upload.single('photo'), async (req, res) => {
  try {
    const shop = await Shop.findOne({ id: req.params.id });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    const { ownerName, contactNumber, shopNumber, address, description, latitude, longitude } = req.body;
    const placeName = await getPlaceName(latitude, longitude);

    shop.ownerName = ownerName;
    shop.contactNumber = contactNumber;
    shop.shopNumber = shopNumber;
    shop.address = address;
    shop.description = description;
    shop.location = { latitude, longitude, placeName };
    shop.timestamp = dateTime.create().format('Y-m-d H:M:S');

    if (req.file) {
      if (shop.photo && fs.existsSync(path.join(__dirname, 'public', shop.photo))) {
        fs.unlinkSync(path.join(__dirname, 'public', shop.photo));
      }
      shop.photo = `/uploads/${req.file.filename}`;
    }

    await shop.save();
    res.json(shop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shop' });
  }
});

// Delete shop
app.delete('/api/shops/:id', async (req, res) => {
  try {
    const shop = await Shop.findOne({ id: req.params.id });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });

    if (shop.photo && fs.existsSync(path.join(__dirname, 'public', shop.photo))) {
      fs.unlinkSync(path.join(__dirname, 'public', shop.photo));
    }

    await Shop.deleteOne({ id: req.params.id });
    res.json({ message: 'Shop deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete shop' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FlutterFlow API running on http://localhost:${PORT}`);
});
