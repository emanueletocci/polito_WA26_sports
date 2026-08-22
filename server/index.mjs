
import express from 'express';
import morgan from 'morgan';  // logging middleware
import { check, validationResult, oneOf } from 'express-validator'; // validation middleware
import cors from 'cors';

// init express
const app = express();
app.use(morgan('dev'));
// automatically parse incoming JSON requests
app.use(express.json());

// Set up and enable Cross-Origin Resource Sharing (CORS)
const corsOptions = {
  origin: 'http://localhost:5173',
  credentials: true,
};
app.use(cors(corsOptions));


const port = 3001;

// activate the server
app.listen(port, (err) => {
  if (err)
    console.log(err);
  else 
    console.log(`Server listening at http://localhost:${port}`);
}); 
