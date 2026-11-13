import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';

// Creates the first superadmin (or promotes the existing seed account to superadmin).
const email = (process.env.SEED_ADMIN_EMAIL || 'admin@bank.local').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';

await connectDB(process.env.MONGO_URI);

const existing = await User.findOne({ email });
if (!existing) {
  await User.create({ name: 'Super Admin', email, password, role: 'superadmin', status: 'active' });
  console.log(`Created superadmin: ${email} / ${password}  (change this password after first sign-in)`);
} else if (existing.role !== 'superadmin' || existing.status !== 'active') {
  existing.role = 'superadmin';
  existing.status = 'active';
  await existing.save();
  console.log(`Promoted ${email} to superadmin`);
} else {
  console.log(`Superadmin already exists: ${email}`);
}

await mongoose.disconnect();
