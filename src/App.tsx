import React, { useEffect, useState, useRef } from 'react';
import { auth, db, googleProvider } from './firebase';
import {
  signInWithPopup, signOut, onAuthStateChanged, User,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile
} from 'firebase/auth';
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, updateDoc, deleteDoc
} from 'firebase/firestore';
import { format } from 'date-fns';
import {
  Camera, LogOut, Plus, Search, CheckCircle2, Trash2,
  Image as ImageIcon, UserCircle, Hand, UserCheck, X
} from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { resizeImage } from './lib/imageUtils';

// ─── 自由学園カラー（臙脂色）─────────────────────────
const ENJI       = '#821033';
const ENJI_DARK  = '#5e0b24';
const ENJI_MUTED = '#f7ecef';
const ENJI_BORDER= '#deb8c3';
const CREAM      = '#faf7f3';
const WARM_GRAY  = '#6b5e57';
const LIGHT_BORDER = '#e8ddd7';

// ─── 自由学園 幾何学パターン（建物窓枠モチーフ）─────────
const JiyuPattern = ({
  size = 56,
  color = ENJI,
  opacity = 1,
  style = {} as React.CSSProperties,
}: {
  size?: number;
  color?: string;
  opacity?: number;
  style?: React.CSSProperties;
}) => (
  <svg
    width={size}
    height={Math.round(size * 1.2)}
    viewBox="0 0 100 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ opacity, flexShrink: 0, ...style }}
  >
    <rect x="6"  y="3"  width="88" height="114" stroke={color} strokeWidth="3.5" fill="none" />
    <rect x="13" y="9"  width="74" height="102" stroke={color} strokeWidth="1.5" fill="none" />
    <line x1="50" y1="3"  x2="50" y2="117" stroke={color} strokeWidth="2" />
    <line x1="6"  y1="36" x2="94" y2="36"  stroke={color} strokeWidth="1.5" />
    <line x1="6"  y1="84" x2="94" y2="84"  stroke={color} strokeWidth="1.5" />
    <line x1="13" y1="9"  x2="13" y2="36"  stroke={color} strokeWidth="1" />
    <line x1="28" y1="9"  x2="28" y2="36"  stroke={color} strokeWidth="1" />
    <line x1="72" y1="9"  x2="72" y2="36"  stroke={color} strokeWidth="1" />
    <line x1="87" y1="9"  x2="87" y2="36"  stroke={color} strokeWidth="1" />
    <rect x="18" y="42" width="64" height="36" stroke={color} strokeWidth="1" fill="none" />
    <line x1="33" y1="42" x2="33" y2="78"  stroke={color} strokeWidth="1" />
    <line x1="50" y1="42" x2="50" y2="78"  stroke={color} strokeWidth="1" />
    <line x1="67" y1="42" x2="67" y2="78"  stroke={color} strokeWidth="1" />
    <line x1="18" y1="58" x2="82" y2="58"  stroke={color} strokeWidth="1" />
    <line x1="13" y1="84" x2="13" y2="111" stroke={color} strokeWidth="1" />
    <line x1="28" y1="84" x2="28" y2="111" stroke={color} strokeWidth="1" />
    <line x1="72" y1="84" x2="72" y2="111" stroke={color} strokeWidth="1" />
    <line x1="87" y1="84" x2="87" y2="111" stroke={color} strokeWidth="1" />
    <line x1="13" y1="97" x2="87" y2="97"  stroke={color} strokeWidth="1" />
  </svg>
);

// ─── JIYUワードマーク ────────────────────────────────
const JiyuWordmark = ({ color = '#fff', size = 28 }: { color?: string; size?: number }) => (
  <span style={{
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontWeight: 900,
    fontSize: size,
    letterSpacing: '-0.01em',
    color,
    lineHeight: 1,
  }}>
    JIYU
  </span>
);

// ─── 型定義 ──────────────────────────────────────────
interface LostItem {
  id: string;
  title: string;
  description?: string;
  imageBase64?: string;
  category: '高等部' | '中等部';
  status: '未受取' | '受取済';
  authorUid: string;
  authorName: string;
  claimedByUid?: string;
  claimedByName?: string;
  createdAt: any;
}

// ─── 共通スタイル ─────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: `1px solid ${LIGHT_BORDER}`,
  borderRadius: 3,
  fontSize: 14,
  outline: 'none',
  background: '#fff',
  color: '#1a1a1a',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: WARM_GRAY,
  letterSpacing: '0.06em',
  display: 'block',
  marginBottom: 6,
};

const enjiBtn: React.CSSProperties = {
  backgroundColor: ENJI,
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.15s',
  fontFamily: 'inherit',
};

// ─── メインApp ───────────────────────────────────────
export default function App() {
  const [user,         setUser]         = useState<User | null>(null);
  const [isAuthReady,  setIsAuthReady]  = useState(false);
  const [items,        setItems]        = useState<LostItem[]>([]);
  const [isPosting,    setIsPosting]    = useState(false);
  const [showLogin,    setShowLogin]    = useState(false);

  const isAdmin = user?.email === 'admin1921@jiyu.ac.jp';

  // Auth form
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [name,      setName]      = useState('');
  const [isSignUp,  setIsSignUp]  = useState(false);
  const [authError, setAuthError] = useState('');

  // Post form
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState<'高等部' | '中等部'>('高等部');
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [imagePreview,setImagePreview]= useState<string | null>(null);
  const [isSubmitting,setIsSubmitting]= useState(false);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Detail modal
  const [selectedItem, setSelectedItem] = useState<LostItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    const q = query(collection(db, 'lost_items'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q,
      (snap) => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })) as LostItem[]),
      (err)  => console.error('Error fetching items:', err)
    );
    return () => unsub();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (selectedItem) {
      const updated = items.find(i => i.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
    }
  }, [items]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const allowed = ['@jiyu.ac.jp', '@prf.jiyu.ac.jp', '@std.jiyu.ac.jp'];
    if (!allowed.some(d => email.endsWith(d))) {
      setAuthError('自由学園のメールアドレス（@jiyu.ac.jp など）を使用してください。');
      return;
    }
    try {
      if (isSignUp) {
        if (!name) { setAuthError('名前を入力してください。'); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        setUser({ ...cred.user, displayName: name } as User);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setShowLogin(false);
      setEmail(''); setPassword(''); setName('');
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use')
        setAuthError('このメールアドレスはすでに登録されています。');
      else if (['auth/wrong-password','auth/user-not-found','auth/invalid-credential'].includes(error.code))
        setAuthError('メールアドレスまたはパスワードが間違っています。');
      else if (error.code === 'auth/weak-password')
        setAuthError('パスワードは6文字以上で入力してください。');
      else
        setAuthError('認証エラーが発生しました。');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title || !category) return;
    setIsSubmitting(true);
    try {
      let imageBase64 = '';
      if (imageFile) imageBase64 = await resizeImage(imageFile, 800, 800);
      await addDoc(collection(db, 'lost_items'), {
        title, description, imageBase64, category,
        status: '未受取',
        authorUid: user.uid,
        authorName: user.displayName || 'Anonymous',
        createdAt: serverTimestamp()
      });
      setTitle(''); setDescription(''); setCategory('高等部');
      setImageFile(null); setImagePreview(null); setIsPosting(false);
    } catch {
      alert('投稿に失敗しました。画像サイズが大きすぎる可能性があります。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAsReceived = async (item: LostItem) => {
    if (!user || (user.uid !== item.authorUid && !isAdmin && user.uid !== item.claimedByUid)) return;
    if (!window.confirm('本当に受け取り済みにしますか？\nこの操作は取り消せません。')) return;
    try {
      await updateDoc(doc(db, 'lost_items', item.id), { status: '受取済' });
      setIsDetailOpen(false);
    } catch { alert('更新に失敗しました。'); }
  };

  const handleClaim = async (item: LostItem) => {
    if (!user) return;
    if (!window.confirm('「自分の落とし物です」と投稿者に知らせますか？')) return;
    try {
      await updateDoc(doc(db, 'lost_items', item.id), {
        claimedByUid:  user.uid,
        claimedByName: user.displayName || '名無し'
      });
    } catch { alert('エラーが発生しました。'); }
  };

  const handleDelete = async (item: LostItem) => {
    if (!user || (user.uid !== item.authorUid && !isAdmin)) return;
    if (!window.confirm('本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'lost_items', item.id));
      setIsDetailOpen(false);
    } catch { alert('削除に失敗しました。'); }
  };

  // ─── ローディング ─────────────────────────────────
  if (!isAuthReady) {
    return (
      <div style={{
        minHeight: '100vh', background: CREAM,
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 20
      }}>
        <JiyuPattern size={48} color={ENJI} opacity={0.4} />
        <span style={{ color: WARM_GRAY, fontSize: 14, letterSpacing: '0.1em' }}>読み込み中...</span>
      </div>
    );
  }

  // ─── ログイン画面 ─────────────────────────────────
  if (showLogin) {
    return (
      <div style={{
        minHeight: '100vh', background: CREAM,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div style={{
          width: '100%', maxWidth: 420,
          background: '#fff', borderRadius: 2,
          boxShadow: '0 4px 32px rgba(130,16,51,0.10)',
          overflow: 'hidden', border: `1px solid ${ENJI_BORDER}`
        }}>
          {/* ブランドヘッダー */}
          <div style={{
            background: ENJI, padding: '2.5rem 2rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <JiyuPattern size={44} color="rgba(255,255,255,0.7)" />
              <div style={{ textAlign: 'center' }}>
                <JiyuWordmark color="#fff" size={32} />
                <div style={{
                  color: 'rgba(255,255,255,0.75)', fontSize: 11,
                  letterSpacing: '0.25em', marginTop: 4, fontWeight: 500
                }}>GAKUEN</div>
              </div>
              <JiyuPattern size={44} color="rgba(255,255,255,0.7)" style={{ transform: 'scaleX(-1)' }} />
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.85)', fontSize: 13,
              letterSpacing: '0.15em', borderTop: '1px solid rgba(255,255,255,0.25)',
              paddingTop: 14, width: '100%', textAlign: 'center'
            }}>
              落とし物管理システム
            </div>
          </div>

          {/* フォームエリア */}
          <div style={{ padding: '2rem' }}>
            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
                教職員・生徒用ログイン
              </h2>
              <p style={{ fontSize: 12, color: WARM_GRAY, marginTop: 6, lineHeight: 1.7 }}>
                投稿および管理機能を利用するには、<br />学校のメールアドレスでログインしてください。
              </p>
            </div>

            <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {authError && (
                <div style={{
                  background: '#fef2f4', color: ENJI_DARK,
                  border: `1px solid ${ENJI_BORDER}`,
                  borderRadius: 3, padding: '10px 14px', fontSize: 13, textAlign: 'center'
                }}>
                  {authError}
                </div>
              )}
              {isSignUp && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={labelStyle}>お名前（表示名）</label>
                  <input
                    value={name} onChange={e => setName(e.target.value)}
                    required={isSignUp} placeholder="例: 自由 太郎"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = ENJI)}
                    onBlur={e  => (e.target.style.borderColor = LIGHT_BORDER)}
                  />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>学校のメールアドレス</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="xxx@jiyu.ac.jp"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = ENJI)}
                  onBlur={e  => (e.target.style.borderColor = LIGHT_BORDER)}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>パスワード（6文字以上）</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="••••••••"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = ENJI)}
                  onBlur={e  => (e.target.style.borderColor = LIGHT_BORDER)}
                />
              </div>
              <button
                type="submit"
                style={{ ...enjiBtn, padding: '12px', fontSize: 15, width: '100%', marginTop: 4, letterSpacing: '0.05em' }}
              >
                {isSignUp ? '新規登録' : 'ログイン'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: ENJI, fontSize: 13 }}
              >
                {isSignUp ? 'すでにアカウントをお持ちの方はこちら' : '初めての方はこちら（新規登録）'}
              </button>
              <div style={{ borderTop: `1px solid ${LIGHT_BORDER}`, paddingTop: 12 }}>
                <button
                  onClick={() => setShowLogin(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: WARM_GRAY, fontSize: 13 }}
                >
                  ログインせずに閲覧する
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── アイテムカードリスト ─────────────────────────
  const renderItemList = (categoryFilter: '高等部' | '中等部') => {
    const filtered = items.filter(i => i.category === categoryFilter);
    if (filtered.length === 0) {
      return (
        <div style={{
          textAlign: 'center', padding: '4rem 1rem',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16
        }}>
          <JiyuPattern size={56} color={ENJI} opacity={0.15} />
          <p style={{ color: WARM_GRAY, fontSize: 14 }}>まだ落とし物の投稿はありません。</p>
        </div>
      );
    }
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: '1rem'
      }}>
        {filtered.map(item => (
          <div
            key={item.id}
            onClick={() => { setSelectedItem(item); setIsDetailOpen(true); }}
            style={{
              background: '#fff',
              border: `1px solid ${item.status === '受取済' ? '#e0d8d3' : ENJI_BORDER}`,
              borderTop: `3px solid ${item.status === '受取済' ? '#c9bdb8' : ENJI}`,
              borderRadius: 2,
              cursor: 'pointer',
              overflow: 'hidden',
              transition: 'box-shadow 0.15s, transform 0.15s',
              opacity: item.status === '受取済' ? 0.65 : 1,
              filter: item.status === '受取済' ? 'grayscale(0.4)' : 'none',
              boxShadow: '0 1px 4px rgba(130,16,51,0.06)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(130,16,51,0.16)';
              (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(130,16,51,0.06)';
              (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
            }}
          >
            {/* 画像 */}
            <div style={{
              aspectRatio: '1/1', width: '100%', background: ENJI_MUTED,
              position: 'relative', overflow: 'hidden'
            }}>
              {item.imageBase64 ? (
                <img
                  src={item.imageBase64} alt={item.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <JiyuPattern size={52} color={ENJI} opacity={0.18} />
                </div>
              )}
              {item.status === '受取済' && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.42)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{
                    background: ENJI, color: '#fff',
                    padding: '6px 14px', borderRadius: 2,
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                    display: 'flex', alignItems: 'center', gap: 5
                  }}>
                    <CheckCircle2 size={13} />受取済
                  </span>
                </div>
              )}
            </div>
            {/* テキスト */}
            <div style={{ padding: '10px 12px 12px' }}>
              <h3 style={{
                fontWeight: 700, fontSize: 14, margin: '0 0 4px', color: '#1a1a1a',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis'
              }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 11, color: WARM_GRAY, margin: 0 }}>
                {item.createdAt ? format(item.createdAt.toDate(), 'yyyy/MM/dd HH:mm') : '...'}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ─── メイン画面 ───────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: CREAM, paddingBottom: 80 }}>

      {/* ══ ヘッダー ══ */}
      <header style={{
        background: ENJI,
        borderBottom: `3px solid ${ENJI_DARK}`,
        position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 2px 12px rgba(130,16,51,0.28)'
      }}>
        <div style={{
          maxWidth: 960, margin: '0 auto', padding: '0 1rem',
          height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          {/* ロゴ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <JiyuPattern size={34} color="rgba(255,255,255,0.85)" />
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <JiyuWordmark color="#fff" size={22} />
                <span style={{
                  color: 'rgba(255,255,255,0.7)', fontSize: 10,
                  letterSpacing: '0.22em', fontWeight: 500
                }}>GAKUEN</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, letterSpacing: '0.12em', marginTop: 1 }}>
                落とし物掲示板
              </div>
            </div>
          </div>

          {/* ユーザーコントロール */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user ? (
              <>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                  {user.displayName}
                </span>
                <button
                  onClick={async () => { try { await signOut(auth); } catch (e) { console.error(e); } }}
                  title="ログアウト"
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 3, padding: '6px 10px',
                    cursor: 'pointer', color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12
                  }}
                >
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.4)',
                  borderRadius: 3, padding: '7px 14px',
                  cursor: 'pointer', color: '#fff',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600
                }}
              >
                <UserCircle size={16} />
                ログイン
              </button>
            )}
          </div>
        </div>
        {/* 装飾グリッドライン */}
        <div style={{
          height: 3,
          background: `repeating-linear-gradient(90deg,
            rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 1px,
            transparent 1px, transparent 24px)`,
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }} />
      </header>

      {/* ══ メインコンテンツ ══ */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <Tabs defaultValue="高等部" className="w-full">
          <TabsList style={{
            background: '#fff',
            border: `1px solid ${ENJI_BORDER}`,
            borderBottom: 'none',
            borderRadius: '2px 2px 0 0',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            height: 'auto',
            gap: 0,
          }}>
            {(['高等部', '中等部'] as const).map(tab => (
              <TabsTrigger
                key={tab}
                value={tab}
                style={{ borderRadius: 0, height: 44 }}
                className="
                  text-sm font-semibold tracking-wide border-none
                  data-[state=active]:bg-[#821033] data-[state=active]:text-white data-[state=active]:shadow-none
                  data-[state=inactive]:text-[#6b5e57] data-[state=inactive]:bg-white
                  transition-colors
                "
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          <div style={{
            background: '#fff',
            border: `1px solid ${ENJI_BORDER}`,
            borderTop: `2px solid ${ENJI}`,
            borderRadius: '0 0 2px 2px',
            padding: '1.5rem',
          }}>
            <TabsContent value="高等部" style={{ margin: 0 }}>
              {renderItemList('高等部')}
            </TabsContent>
            <TabsContent value="中等部" style={{ margin: 0 }}>
              {renderItemList('中等部')}
            </TabsContent>
          </div>
        </Tabs>
      </main>

      {/* ══ FAB（投稿ボタン）══ */}
      {user && (
        <Dialog open={isPosting} onOpenChange={setIsPosting}>
          <button
            onClick={() => setIsPosting(true)}
            style={{
              position: 'fixed', bottom: 28, right: 24,
              width: 56, height: 56, borderRadius: '50%',
              background: ENJI, border: `2px solid ${ENJI_DARK}`,
              boxShadow: '0 4px 20px rgba(130,16,51,0.40)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff', zIndex: 100,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform   = 'scale(1.09)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow   = '0 6px 28px rgba(130,16,51,0.52)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform   = 'scale(1)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow   = '0 4px 20px rgba(130,16,51,0.40)';
            }}
          >
            <Plus size={24} />
          </button>

          {/* 投稿ダイアログ */}
          <DialogContent style={{ maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', borderRadius: 2 }}>
            <DialogHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <JiyuPattern size={24} color={ENJI} />
                <DialogTitle style={{ color: ENJI, fontSize: 18 }}>落とし物を投稿</DialogTitle>
              </div>
              <DialogDescription style={{ fontSize: 13 }}>
                見つけた落とし物の情報を入力してください。
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
              {/* 写真 */}
              <div>
                <label style={labelStyle}>写真</label>
                <div style={{
                  border: `2px dashed ${imagePreview ? ENJI : ENJI_BORDER}`,
                  borderRadius: 3, padding: 16, textAlign: 'center', background: ENJI_MUTED
                }}>
                  {imagePreview ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={imagePreview} alt="Preview" style={{ maxHeight: 180, borderRadius: 2 }} />
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); }}
                        style={{
                          position: 'absolute', top: 6, right: 6,
                          background: ENJI, border: 'none', borderRadius: '50%',
                          width: 24, height: 24, cursor: 'pointer', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <Camera size={36} color={ENJI} opacity={0.35} />
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            background: '#fff', color: ENJI,
                            border: `1px solid ${ENJI_BORDER}`,
                            borderRadius: 3, padding: '7px 14px', fontSize: 13,
                            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5
                          }}
                        >
                          <ImageIcon size={14} />ライブラリから
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          style={{
                            background: '#fff', color: ENJI,
                            border: `1px solid ${ENJI_BORDER}`,
                            borderRadius: 3, padding: '7px 14px', fontSize: 13,
                            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5
                          }}
                        >
                          <Camera size={14} />写真を撮る
                        </button>
                      </div>
                    </div>
                  )}
                  <input type="file" accept="image/*"                className="hidden" ref={fileInputRef}   onChange={handleImageChange} />
                  <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleImageChange} />
                </div>
              </div>

              {/* タイトル */}
              <div>
                <label style={labelStyle}>タイトル（必須）</label>
                <input
                  placeholder="例: 黒い筆箱、青い水筒など"
                  value={title} onChange={e => setTitle(e.target.value)}
                  required maxLength={50}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = ENJI)}
                  onBlur={e  => (e.target.style.borderColor = LIGHT_BORDER)}
                />
              </div>

              {/* 区分 */}
              <div>
                <label style={labelStyle}>区分（必須）</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as '高等部' | '中等部')}
                  style={{ ...inputStyle, appearance: 'none' as const }}
                >
                  <option value="高等部">高等部</option>
                  <option value="中等部">中等部</option>
                </select>
              </div>

              {/* 詳細 */}
              <div>
                <label style={labelStyle}>詳細（任意）</label>
                <textarea
                  placeholder="見つけた場所や特徴など"
                  value={description} onChange={e => setDescription(e.target.value)}
                  rows={3} maxLength={200}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
                  onFocus={e => (e.target.style.borderColor = ENJI)}
                  onBlur={e  => (e.target.style.borderColor = LIGHT_BORDER)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setIsPosting(false)}
                  disabled={isSubmitting}
                  style={{
                    background: '#fff', border: `1px solid ${LIGHT_BORDER}`,
                    borderRadius: 3, padding: '8px 18px', cursor: 'pointer',
                    color: WARM_GRAY, fontSize: 14, fontWeight: 600, fontFamily: 'inherit'
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={!title || isSubmitting}
                  style={{
                    ...enjiBtn, padding: '8px 22px', fontSize: 14,
                    opacity: (!title || isSubmitting) ? 0.6 : 1,
                    cursor: (!title || isSubmitting) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmitting ? '投稿中...' : '投稿する'}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ══ 詳細モーダル ══ */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent style={{ maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: 0, borderRadius: 2 }}>
          {selectedItem && (
            <>
              {/* 画像エリア */}
              <div style={{ background: ENJI_MUTED, position: 'relative', width: '100%' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: ENJI, zIndex: 1 }} />
                {selectedItem.imageBase64 ? (
                  <img
                    src={selectedItem.imageBase64} alt={selectedItem.title}
                    style={{ width: '100%', maxHeight: '40vh', objectFit: 'contain', display: 'block' }}
                  />
                ) : (
                  <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <JiyuPattern size={72} color={ENJI} opacity={0.15} />
                  </div>
                )}
                {/* バッジ */}
                <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 8, zIndex: 1 }}>
                  <span style={{
                    background: 'rgba(255,255,255,0.92)', color: ENJI,
                    padding: '4px 10px', borderRadius: 2, fontSize: 11,
                    fontWeight: 700, letterSpacing: '0.08em', border: `1px solid ${ENJI_BORDER}`
                  }}>
                    {selectedItem.category}
                  </span>
                  {selectedItem.status === '受取済' && (
                    <span style={{
                      background: ENJI, color: '#fff',
                      padding: '4px 10px', borderRadius: 2, fontSize: 11,
                      fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4
                    }}>
                      <CheckCircle2 size={11} />受取済
                    </span>
                  )}
                </div>
              </div>

              {/* テキストエリア */}
              <div style={{ padding: '1.5rem' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: '#1a1a1a' }}>
                  {selectedItem.title}
                </h2>
                <p style={{ fontSize: 12, color: WARM_GRAY, margin: '0 0 2px' }}>
                  投稿日: {selectedItem.createdAt
                    ? format(selectedItem.createdAt.toDate(), 'yyyy年MM月dd日 HH:mm')
                    : '...'}
                </p>
                <p style={{ fontSize: 12, color: WARM_GRAY, margin: 0 }}>
                  投稿者: {selectedItem.authorName}
                </p>

                {selectedItem.description && (
                  <div style={{
                    background: ENJI_MUTED,
                    border: `1px solid ${ENJI_BORDER}`,
                    borderLeft: `3px solid ${ENJI}`,
                    borderRadius: '0 3px 3px 0',
                    padding: '12px 14px', marginTop: 14
                  }}>
                    <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', margin: 0, color: '#333' }}>
                      {selectedItem.description}
                    </p>
                  </div>
                )}

                {selectedItem.claimedByUid && selectedItem.status === '未受取' && (
                  <div style={{
                    background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: 3, padding: '10px 14px', marginTop: 14,
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1d4ed8'
                  }}>
                    <UserCheck size={16} />
                    {selectedItem.claimedByName}さんが「自分のもの」として名乗り出ています。
                  </div>
                )}

                {/* アクションボタン群 */}
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {user && user.uid !== selectedItem.authorUid && !isAdmin &&
                    !selectedItem.claimedByUid && selectedItem.status === '未受取' && (
                    <button
                      onClick={() => handleClaim(selectedItem)}
                      style={{
                        background: '#1d4ed8', color: '#fff', border: 'none',
                        borderRadius: 3, padding: '12px', fontSize: 15, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                      }}
                    >
                      <Hand size={18} />私のです！（受け取りに行きます）
                    </button>
                  )}

                  {user &&
                    (user.uid === selectedItem.authorUid || isAdmin || user.uid === selectedItem.claimedByUid) &&
                    selectedItem.status === '未受取' && (
                    <button
                      onClick={() => handleMarkAsReceived(selectedItem)}
                      style={{
                        ...enjiBtn, padding: '12px', fontSize: 15, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                      }}
                    >
                      <CheckCircle2 size={18} />
                      {user.uid === selectedItem.claimedByUid
                        ? '受け取りました（受取済にする）'
                        : '持ち主に渡した（受取済にする）'}
                    </button>
                  )}

                  {user && (user.uid === selectedItem.authorUid || isAdmin) && (
                    <button
                      onClick={() => handleDelete(selectedItem)}
                      style={{
                        background: '#fff', border: '1px solid #fca5a5',
                        color: '#dc2626', borderRadius: 3, padding: '10px', fontSize: 14,
                        fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}
                    >
                      <Trash2 size={16} />この投稿を削除する
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
