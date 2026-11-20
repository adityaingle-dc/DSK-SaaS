import app from './app.js';
import { connectDB } from './config/db.js';
import { backfillDraftState } from './services/draftState.js';

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy server/.env.example to server/.env');
  process.exit(1);
}

connectDB(process.env.MONGO_URI)
  .then(() => {
    // sheets from before the site inspection / draft sheet split: work out their draft state (once)
    backfillDraftState().then((n) => n && console.log(`Draft state worked out for ${n} input sheet(s)`)).catch((e) => console.warn('draft state backfill:', e.message));
    app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
