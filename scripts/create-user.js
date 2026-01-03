// scripts/create-user.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Brakuje SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createUser(email, password, role = 'user', fullName = '') {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    user_metadata: { full_name: fullName }
  });
  if (error) throw error;
  // create profile row
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .insert([{ id: data.user.id, full_name: fullName, role }]);
  if (pErr) throw pErr;
  return { user: data.user, profile };
}

(async () => {
  const email = process.argv[2];
  const password = process.argv[3] || 'TempPass123!';
  const role = process.argv[4] || 'user';
  const fullName = process.argv[5] || '';
  if (!email) {
    console.error('Użycie: node scripts/create-user.js email [password] [role] [fullName]');
    process.exit(1);
  }
  try {
    const res = await createUser(email, password, role, fullName);
    console.log('Utworzono użytkownika:', res);
  } catch (e) {
    console.error('Błąd:', e);
    process.exit(1);
  }
})();
