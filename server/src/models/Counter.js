import mongoose from 'mongoose';

// Running sequence per ID type (emp, inp, cin, rpt). Incremented atomically, so concurrent saves never share a number.
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });

export default mongoose.model('Counter', counterSchema);
