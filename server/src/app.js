import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import valuationRoutes from './routes/valuations.js';
import fileRoutes from './routes/files.js';
import activityRoutes from './routes/activity.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();
app.set('trust proxy', 'loopback'); // real client IP behind a local reverse proxy (for the activity log)

app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '2mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/valuations', valuationRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/activity', activityRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
