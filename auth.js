import { supabase } from '../config/supabase.js';

export async function login(email, password) {
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (userError) throw userError;
  if (!userData) throw new Error('User not found');

  if (password !== 'password123') {
    throw new Error('Invalid password');
  }

  if (!userData.is_active) {
    throw new Error('Account is inactive');
  }

  localStorage.setItem('user_id', userData.id);
  localStorage.setItem('user_role', userData.role);
  localStorage.setItem('user_email', userData.email);

  return { user: { id: userData.id, email: userData.email }, profile: userData };
}

export async function logout() {
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_email');
}

export async function getCurrentUser() {
  const userId = localStorage.getItem('user_id');

  if (!userId) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    localStorage.clear();
    return null;
  }

  return { user: { id: profile.id, email: profile.email }, profile };
}

export async function getSupplierProfile(userId) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
