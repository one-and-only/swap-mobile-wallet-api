import 'dotenv/config';
import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.send('This API doesn\'t have a frontend, but at least you\'re here :D');
});

app.listen(1985, () =>
  console.log('Mobile Wallet API listening on port 1985!'),
);
