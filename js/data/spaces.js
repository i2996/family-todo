import { supabase, unwrap } from './client.js';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O/1/I 제외
export function generateCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export async function createSpace(name, password) {
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase.rpc('create_space', {
      p_name: name,
      p_code: generateCode(),
      p_password: password,
    });
    if (!error) return data;
    if (error.code !== '23505') throw error; // 코드 중복일 때만 재시도
  }
  throw new Error('가족 코드를 만들지 못했어요. 다시 시도해주세요.');
}

export const joinSpace = async (code, password) =>
  unwrap(await supabase.rpc('join_space', { p_code: code, p_password: password }));

export const getSpace = async (id) =>
  unwrap(await supabase.from('spaces').select('id,code,name,created_at').eq('id', id).single());

export const renameSpace = async (id, name) =>
  unwrap(await supabase.from('spaces').update({ name }).eq('id', id).select('id,code,name,created_at').single());

export const changePassword = async (id, newPassword) =>
  unwrap(await supabase.rpc('change_space_password', { p_space_id: id, p_new_password: newPassword }));
