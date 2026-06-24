import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, 'uploads');
const envFile = path.join(__dirname, '.env');
const upload = multer({ dest: uploadDir });

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

const books = [];
const purchases = [];

function paginateText(text, wordsPerPage = 180) {
  const words = text.split(/\s+/).filter(Boolean);
  const pages = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    pages.push(words.slice(i, i + wordsPerPage).join(' '));
  }
  if (pages.length === 0) {
    pages.push('Empty book content.');
  }
  return pages;
}

function getPurchasedPages(bookId) {
  return purchases
    .filter((purchase) => purchase.bookId === bookId && purchase.status === 'completed')
    .flatMap((purchase) => purchase.pages)
    .filter((page, index, array) => array.indexOf(page) === index)
    .sort((a, b) => a - b);
}

function getMpesaConfig() {
  return {
    consumerKey: process.env.MPESA_CONSUMER_KEY?.trim() || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET?.trim() || '',
    shortcode: process.env.MPESA_SHORTCODE?.trim() || '',
    passkey: process.env.MPESA_PASSKEY?.trim() || '',
    callbackUrl: process.env.MPESA_CALLBACK_URL?.trim() || ''
  };
}

function validateMpesaCredentials(res) {
  const missing = [];
  const required = ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'MPESA_CALLBACK_URL'];
  for (const field of required) {
    const value = process.env[field] && process.env[field].trim();
    if (!value) missing.push(field);
  }
  if (missing.length) {
    res.status(500).json({
      message: 'Missing M-Pesa Daraja credentials. Enter them via /api/mpesa/config or in server/.env and restart the server.',
      missing
    });
    return false;
  }
  return true;
}

async function saveMpesaConfigToEnv(config) {
  const lines = [];
  const existing = {};
  try {
    const text = await fs.readFile(envFile, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) {
        lines.push(rawLine);
        continue;
      }
      const [key] = line.split('=', 1);
      existing[key.trim()] = rawLine;
    }
  } catch (err) {
    // ignore missing .env file and create a new one
  }

  const setEnvValue = (key, value) => {
    const quoted = value.includes(' ') ? `"${value.replace(/"/g, '\\"')}"` : value;
    existing[key] = `${key}=${quoted}`;
  };

  setEnvValue('MPESA_CONSUMER_KEY', config.consumerKey);
  setEnvValue('MPESA_CONSUMER_SECRET', config.consumerSecret);
  setEnvValue('MPESA_SHORTCODE', config.shortcode);
  setEnvValue('MPESA_PASSKEY', config.passkey);
  setEnvValue('MPESA_CALLBACK_URL', config.callbackUrl);

  const output = Object.values(existing).join('\n') + '\n';
  await fs.writeFile(envFile, output, 'utf8');
}

app.get('/api/mpesa/config', (req, res) => {
  const config = getMpesaConfig();
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key.toUpperCase());
  res.json({ enabled: missing.length === 0, missing, config });
});

app.post('/api/mpesa/config', async (req, res) => {
  const { consumerKey, consumerSecret, shortcode, passkey, callbackUrl } = req.body;
  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl) {
    return res.status(400).json({ message: 'All M-Pesa Daraja credential fields are required.' });
  }

  process.env.MPESA_CONSUMER_KEY = consumerKey;
  process.env.MPESA_CONSUMER_SECRET = consumerSecret;
  process.env.MPESA_SHORTCODE = shortcode;
  process.env.MPESA_PASSKEY = passkey;
  process.env.MPESA_CALLBACK_URL = callbackUrl;

  try {
    await saveMpesaConfigToEnv({ consumerKey, consumerSecret, shortcode, passkey, callbackUrl });
  } catch (error) {
    console.error('Failed to save M-Pesa config to .env:', error);
  }

  res.json({ enabled: true, missing: [], config: getMpesaConfig() });
});

app.post('/api/books', upload.single('file'), async (req, res) => {
  try {
    const { title, author, pricePerPage, destinationType, destinationValue } = req.body;
    if (!req.file || !title || !author || !pricePerPage) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const validTypes = ['default', 'mpesa_phone', 'bank_account'];
    const type = destinationType && validTypes.includes(destinationType) ? destinationType : 'default';
    const value = destinationValue?.trim() || null;
    if (type !== 'default' && !value) {
      return res.status(400).json({ message: 'Destination value is required for the selected payment destination type.' });
    }

    const filePath = `/uploads/${req.file.filename}`;
    const book = {
      id: `${Date.now()}`,
      title,
      author,
      pricePerPage: Number(pricePerPage),
      paymentDestination: {
        type,
        value
      },
      filePath,
      pages: 100,
      pagesContent: []
    };

    const lowerName = req.file.originalname.toLowerCase();
    const isTextFile = req.file.mimetype.startsWith('text/') || lowerName.endsWith('.txt');
    const isPdfFile = lowerName.endsWith('.pdf');
    const isDocxFile = lowerName.endsWith('.docx');

    if (isTextFile) {
      const raw = await fs.readFile(req.file.path, 'utf8');
      book.pagesContent = paginateText(raw);
      book.pages = book.pagesContent.length;
    } else if (isPdfFile || isDocxFile) {
      book.pages = 100;
    }

    books.push(book);
    return res.json({ ...book, pagesContent: undefined });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Upload failed.', error: error.message });
  }
});

app.get('/api/books', (req, res) => {
  res.json(books.map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    pricePerPage: book.pricePerPage,
    paymentDestination: book.paymentDestination,
    pages: book.pages,
    filePath: book.filePath
  })));
});

app.get('/api/books/:bookId', (req, res) => {
  const { bookId } = req.params;
  const book = books.find((item) => item.id === bookId);
  if (!book) {
    return res.status(404).json({ message: 'Book not found.' });
  }

  const purchasedPages = getPurchasedPages(bookId);
  res.json({
    id: book.id,
    title: book.title,
    author: book.author,
    pricePerPage: book.pricePerPage,
    paymentDestination: book.paymentDestination,
    pages: book.pages,
    filePath: book.filePath,
    purchasedPages
  });
});

app.post('/api/payments/mpesa', async (req, res) => {
  const { bookId, page, pages, phoneNumber } = req.body;
  const book = books.find((item) => item.id === bookId);
  if (!book) {
    return res.status(404).json({ message: 'Book not found.' });
  }

  const pageNumbers = Array.isArray(pages)
    ? pages.map((item) => Number(item))
    : [Number(page)];

  if (!pageNumbers.length || pageNumbers.some((pageNumber) => Number.isNaN(pageNumber) || pageNumber < 1 || pageNumber > book.pages)) {
    return res.status(400).json({ message: 'Invalid page selection.' });
  }

  if (!phoneNumber) {
    return res.status(400).json({ message: 'Phone number is required for M-Pesa payment.' });
  }

  const amount = book.pricePerPage * pageNumbers.length;
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  const destination = book.paymentDestination;
  const destinationShortcode = process.env.MPESA_SHORTCODE;
  const accountReference = destination.type === 'mpesa_phone'
    ? destination.value
    : destination.type === 'bank_account'
      ? `BANK:${destination.value}`
      : `${bookId}-${pageNumbers.join(',')}`;

  const payload = {
    BusinessShortCode: destinationShortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phoneNumber,
    PartyB: destinationShortcode,
    PhoneNumber: phoneNumber,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: accountReference,
    TransactionDesc: `Pay for ${pageNumbers.length} page(s) of ${book.title}`
  };

  if (!validateMpesaCredentials(res)) {
    return;
  }

  try {
    const tokenResp = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64')}`
      }
    });
    const tokenText = await tokenResp.text();
    let tokenData;
    try {
      tokenData = tokenText ? JSON.parse(tokenText) : null;
    } catch (parseError) {
      console.error('M-Pesa token JSON parse error:', parseError, 'raw:', tokenText);
      return res.status(500).json({
        message: 'Failed to parse M-Pesa token response.',
        status: tokenResp.status,
        raw: tokenText,
        error: parseError.message
      });
    }

    if (!tokenResp.ok) {
      return res.status(500).json({
        message: 'M-Pesa token request failed.',
        status: tokenResp.status,
        details: tokenData || tokenText
      });
    }

    if (!tokenData?.access_token) {
      return res.status(500).json({
        message: 'Failed to get M-Pesa access token.',
        details: tokenData || tokenText
      });
    }

    const response = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      console.error('M-Pesa STK Push JSON parse error:', parseError, 'raw:', responseText);
      return res.status(500).json({
        message: 'Failed to parse M-Pesa STK Push response.',
        status: response.status,
        raw: responseText,
        error: parseError.message
      });
    }

    if (!response.ok || data?.errorCode || data?.errorMessage || data?.ResponseCode !== '0') {
      return res.status(500).json({
        message: 'M-Pesa STK Push failed to initiate.',
        status: response.status,
        details: data || responseText
      });
    }

    purchases.push({
      id: `${Date.now()}`,
      bookId,
      pages: pageNumbers,
      phoneNumber,
      status: 'pending',
      mpesaResponse: data,
      createdAt: new Date().toISOString()
    });

    return res.json({ message: 'STK Push sent. Check your phone.', data });
  } catch (error) {
    console.error('M-Pesa payment error:', error);
    return res.status(500).json({ message: 'Failed to initiate M-Pesa payment.', error: error.message, stack: error.stack });
  }
});

app.post('/api/payments/mpesa/callback', (req, res) => {
  const callback = req.body;
  const { Body } = callback;
  const checkoutRequestID = Body?.stkCallback?.CheckoutRequestID;
  const resultCode = Body?.stkCallback?.ResultCode;
  const resultDesc = Body?.stkCallback?.ResultDesc;

  const purchase = purchases.find((item) => item.mpesaResponse?.CheckoutRequestID === checkoutRequestID);
  if (purchase) {
    purchase.status = resultCode === 0 ? 'completed' : 'failed';
    purchase.resultCode = resultCode;
    purchase.resultDesc = resultDesc;
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

app.get('/api/reader/:bookId/page/:page', (req, res) => {
  const { bookId, page } = req.params;
  const book = books.find((item) => item.id === bookId);
  if (!book) {
    return res.status(404).json({ message: 'Book not found.' });
  }

  const pageNumber = Number(page);
  if (Number.isNaN(pageNumber) || pageNumber < 1 || pageNumber > book.pages) {
    return res.status(400).json({ message: 'Invalid page number.' });
  }

  const hasPurchase = purchases.some(
    (item) =>
      item.bookId === bookId &&
      item.status === 'completed' &&
      item.pages.includes(pageNumber)
  );

  if (!hasPurchase) {
    return res.status(403).json({ message: 'Page not purchased yet.' });
  }

  const content = book.pagesContent.length
    ? book.pagesContent[pageNumber - 1]
    : `This is sample content for page ${pageNumber} of ${book.title}.`;

  return res.json({ bookId, page: pageNumber, content });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  return res.sendFile(path.join(clientDist, 'index.html'));
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
