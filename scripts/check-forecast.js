import fs from 'node:fs';
import { EXAMPLE_BANNER, validateForecast } from '../lib/forecast.js';

const args = process.argv.slice(2);
const exampleMode = args.includes('--example');
const fileArg = args.find((arg) => !arg.startsWith('-'));
const file = fileArg ?? new URL('../data/forecast.example.json', import.meta.url);

const bannedFragments = [
  ['125', '000'].join(''),
  ['282', '09'].join(''),
  ['Cl', 'aude'].join(''),
  ['X Su', 'per'].join(''),
  ['GOC', 'SPX-'].join(''),
  ['BEGIN ', 'PRIVATE'].join(''),
];

try {
  const text = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const errors = validateForecast(data);
  if (exampleMode) {
    if (!text.includes(EXAMPLE_BANNER)) {
      errors.push('example file must be marked as example data inside the file');
    }
    const lower = text.toLowerCase();
    if (bannedFragments.some((fragment) => lower.includes(fragment.toLowerCase()))) {
      errors.push('example file contains disallowed content');
    }
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) {
      errors.push('example file must not contain email addresses');
    }
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('ok');
} catch (error) {
  console.error(error && error.code === 'ENOENT' ? 'file not found' : 'forecast file is not valid JSON');
  process.exit(1);
}
