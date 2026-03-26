import React, { useEffect, useState, useRef } from 'react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { Camera, LogOut, Plus, Search, CheckCircle2, Trash2, School, Image as ImageIcon, UserCircle, Hand, UserCheck, Eye, EyeOff, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { resizeImage } from './lib/imageUtils';

interface LostItem {
  id: string;
  title: string;
  description?: string;
  searchKeywords?: string;
  imageBase64?: string;
  category: string;
  status: '未受取' | '受取済';
  authorUid: string;
  authorName: string;
  claimedByUid?: string;
  claimedByName?: string;
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [items, setItems] = useState<LostItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['高等部', '中等部']);
  const [activeCategory, setActiveCategory] = useState('すべて');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  
  const isAdmin = user?.email === 'admin1921@jiyu.ac.jp';

  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // Post Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [searchKeywords, setSearchKeywords] = useState('');
  const [category, setCategory] = useState<string>('高等部');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Admin State
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  // Detail Modal State
  const [selectedItem, setSelectedItem] = useState<LostItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(collection(db, 'lost_items'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LostItem[];
      setItems(fetchedItems);
    }, (error) => {
      console.error("Error fetching items:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(collection(db, 'categories'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedCategories = snapshot.docs.map(doc => doc.id).sort();
      if (fetchedCategories.length > 0) {
        setCategories(fetchedCategories);
      } else {
        // Fallback to default categories if empty
        setCategories(['中等部', '高等部']);
      }
    }, (error) => {
      console.error("Error fetching categories:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  useEffect(() => {
    if (selectedItem) {
      const updatedItem = items.find(item => item.id === selectedItem.id);
      if (updatedItem) {
        setSelectedItem(updatedItem);
      }
    }
  }, [items, selectedItem]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setShowLogin(false);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const allowedDomains = ['@jiyu.ac.jp', '@prf.jiyu.ac.jp', '@std.jiyu.ac.jp'];
    const isValidDomain = allowedDomains.some(domain => email.endsWith(domain));

    if (!isValidDomain) {
      setAuthError('自由学園のメールアドレス（@jiyu.ac.jp など）を使用してください。');
      return;
    }

    try {
      if (isSignUp) {
        if (!name) {
          setAuthError('名前を入力してください。');
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        // Force reload user to get updated displayName in state
        setUser({ ...userCredential.user, displayName: name } as User);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setShowLogin(false);
      // clear form
      setEmail('');
      setPassword('');
      setName('');
    } catch (error: any) {
      console.error("Auth failed:", error);
      if (error.code === 'auth/email-already-in-use') {
        setAuthError('このメールアドレスはすでに登録されています。');
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        setAuthError('メールアドレスまたはパスワードが間違っています。');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('パスワードは6文字以上で入力してください。');
      } else {
        setAuthError('認証エラーが発生しました。');
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetEmailSent(true);
    } catch (error: any) {
      console.error("Password reset failed:", error);
      setAuthError('パスワードリセットメールの送信に失敗しました。メールアドレスを確認してください。');
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title || !category) return;

    setIsSubmitting(true);
    try {
      let imageBase64 = '';
      if (imageFile) {
        // Resize and compress image to keep it under Firestore limits
        imageBase64 = await resizeImage(imageFile, 800, 800);
      }

      await addDoc(collection(db, 'lost_items'), {
        title,
        description,
        searchKeywords,
        imageBase64,
        category,
        status: '未受取',
        authorUid: user.uid,
        authorName: user.displayName || 'Anonymous',
        createdAt: serverTimestamp()
      });

      // Reset form
      setTitle('');
      setDescription('');
      setSearchKeywords('');
      setCategory(categories[0] || '高等部');
      setImageFile(null);
      setImagePreview(null);
      setIsPosting(false);
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("投稿に失敗しました。画像サイズが大きすぎる可能性があります。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAsReceived = async (item: LostItem) => {
    if (!user || (user.uid !== item.authorUid && !isAdmin && user.uid !== item.claimedByUid)) return;
    if (!window.confirm("本当に受け取り済みにしますか？\nこの操作は取り消せません。")) return;
    try {
      const docRef = doc(db, 'lost_items', item.id);
      await updateDoc(docRef, {
        status: '受取済'
      });
      setIsDetailOpen(false);
    } catch (error) {
      console.error("Error updating document: ", error);
      alert("更新に失敗しました。");
    }
  };

  const handleClaim = async (item: LostItem) => {
    if (!user) return;
    if (!window.confirm("「自分の落とし物です」と投稿者に知らせますか？")) return;
    try {
      const docRef = doc(db, 'lost_items', item.id);
      await updateDoc(docRef, {
        claimedByUid: user.uid,
        claimedByName: user.displayName || '名無し'
      });
    } catch (error) {
      console.error("Error claiming item: ", error);
      alert("エラーが発生しました。");
    }
  };

  const handleDelete = async (item: LostItem) => {
    if (!user || (user.uid !== item.authorUid && !isAdmin)) return;
    if (!window.confirm("本当に削除しますか？")) return;
    
    try {
      const docRef = doc(db, 'lost_items', item.id);
      await deleteDoc(docRef);
      setIsDetailOpen(false);
    } catch (error) {
      console.error("Error deleting document: ", error);
      alert("削除に失敗しました。");
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim() || !isAdmin) return;
    try {
      await setDoc(doc(db, 'categories', newCategory.trim()), {});
      setNewCategory('');
    } catch (error) {
      alert('カテゴリーの追加に失敗しました。');
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    if (!isAdmin || !window.confirm(`「${cat}」を削除しますか？`)) return;
    try {
      await deleteDoc(doc(db, 'categories', cat));
    } catch (error) {
      alert('カテゴリーの削除に失敗しました。');
    }
  };

  if (!isAuthReady) {
    return <div className="flex items-center justify-center min-h-screen bg-[#FCF8F8] text-[#8A1A22] font-serif text-lg">読み込み中...</div>;
  }

  if (showLogin) {
    return (
      <div className="min-h-screen bg-[#FCF8F8] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-[#F0E6E6]">
          <div className="bg-[#8A1A22] p-10 text-center relative">
            <School className="w-16 h-16 mx-auto mb-4 text-white/90" />
            <h1 className="text-3xl font-serif text-white tracking-widest drop-shadow-sm">自由学園</h1>
            <p className="text-[#F5EAEA] text-sm mt-3 tracking-widest font-medium">落とし物管理システム</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-bold text-gray-800">
                {isResetPassword ? 'パスワードの再設定' : '教職員・生徒用ログイン'}
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                {isResetPassword 
                  ? '登録したメールアドレスを入力してください。再設定用のリンクを送信します。'
                  : '投稿および管理機能を利用するには、学校のメールアドレスでログインしてください。'}
              </p>
            </div>
            
            {isResetPassword ? (
              <form onSubmit={handleResetPassword} className="space-y-5">
                {authError && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm text-center font-medium">
                    {authError}
                  </div>
                )}
                {resetEmailSent && (
                  <div className="bg-green-50 text-green-700 p-4 rounded-2xl text-sm text-center font-medium">
                    パスワード再設定メールを送信しました。メールをご確認ください。
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-gray-700 font-semibold">学校のメールアドレス</Label>
                  <Input 
                    id="reset-email" 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                    placeholder="xxx@jiyu.ac.jp" 
                    className="rounded-xl h-12 bg-gray-50 border-gray-200 focus-visible:ring-[#8A1A22]"
                  />
                </div>
                <Button type="submit" className="w-full h-14 rounded-full text-lg font-bold bg-[#8A1A22] hover:bg-[#6D141A] shadow-md transition-all" disabled={resetEmailSent}>
                  送信する
                </Button>
                <div className="text-center pt-2">
                  <Button variant="link" onClick={() => { setIsResetPassword(false); setResetEmailSent(false); setAuthError(''); }} className="text-gray-500 hover:text-[#8A1A22] text-sm">
                    ログイン画面に戻る
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleEmailAuth} className="space-y-5">
                {authError && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm text-center font-medium">
                    {authError}
                  </div>
                )}
                
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-gray-700 font-semibold">お名前（表示名）</Label>
                    <Input 
                      id="name" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      required={isSignUp} 
                      placeholder="例: 自由 太郎" 
                      className="rounded-xl h-12 bg-gray-50 border-gray-200 focus-visible:ring-[#8A1A22]"
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-700 font-semibold">学校のメールアドレス</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                    placeholder="xxx@jiyu.ac.jp" 
                    className="rounded-xl h-12 bg-gray-50 border-gray-200 focus-visible:ring-[#8A1A22]"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="password" className="text-gray-700 font-semibold">パスワード（6文字以上）</Label>
                    {!isSignUp && (
                      <Button type="button" variant="link" className="h-auto p-0 text-xs text-gray-400 hover:text-[#8A1A22]" onClick={() => { setIsResetPassword(true); setAuthError(''); }}>
                        パスワードを忘れた場合
                      </Button>
                    )}
                  </div>
                  <div className="relative">
                    <Input 
                      id="password" 
                      type={showPassword ? "text" : "password"} 
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      required 
                      placeholder="••••••••" 
                      className="rounded-xl h-12 bg-gray-50 border-gray-200 focus-visible:ring-[#8A1A22]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-10 w-10 text-gray-400 hover:text-gray-600 rounded-lg"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </Button>
                  </div>
                </div>

                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-gray-700 font-semibold">パスワード（確認用）</Label>
                    <div className="relative">
                      <Input 
                        id="confirmPassword" 
                        type={showPassword ? "text" : "password"} 
                        value={confirmPassword} 
                        onChange={e => setConfirmPassword(e.target.value)} 
                        required 
                        placeholder="••••••••" 
                        className="rounded-xl h-12 bg-gray-50 border-gray-200 focus-visible:ring-[#8A1A22]"
                      />
                    </div>
                  </div>
                )}
                
                <Button type="submit" className="w-full h-14 rounded-full text-lg font-bold bg-[#8A1A22] hover:bg-[#6D141A] shadow-md transition-all">
                  {isSignUp ? '新規登録' : 'ログイン'}
                </Button>
              </form>
            )}

            {!isResetPassword && (
              <div className="text-center space-y-3 pt-2">
                <Button 
                  variant="link" 
                  onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }} 
                  className="text-gray-500 hover:text-[#8A1A22] text-sm"
                >
                  {isSignUp ? 'すでにアカウントをお持ちの方はこちら' : '初めての方はこちら（新規登録）'}
                </Button>
                <div className="w-full border-t border-gray-100 my-4"></div>
                <Button variant="ghost" onClick={() => setShowLogin(false)} className="text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-full h-12 w-full font-medium">
                  ログインせずに閲覧する
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const normalizeText = (text: string) => {
    if (!text) return '';
    return text
      .replace(/[\u30a1-\u30f6]/g, (match) => String.fromCharCode(match.charCodeAt(0) - 0x60)) // Katakana to Hiragana
      .toLowerCase();
  };

  const renderItemList = () => {
    const normalizedQuery = normalizeText(searchQuery);
    const filteredItems = items.filter(item => {
      if (activeCategory !== 'すべて' && item.category !== activeCategory) return false;
      if (!normalizedQuery) return true;
      
      const targetText = normalizeText(`${item.title} ${item.description || ''} ${item.searchKeywords || ''} ${item.category}`);
      return targetText.includes(normalizedQuery);
    });
    
    if (filteredItems.length === 0) {
      return (
        <div className="text-center py-20 text-gray-400">
          <Search className="mx-auto h-16 w-16 opacity-20 mb-4" />
          <p className="text-lg font-medium">該当する落とし物はありません。</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {filteredItems.map(item => (
          <Card 
            key={item.id} 
            className={`cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 rounded-[2rem] border-0 bg-white shadow-sm overflow-hidden ${item.status === '受取済' ? 'opacity-70 grayscale-[0.5]' : ''}`}
            onClick={() => {
              setSelectedItem(item);
              setIsDetailOpen(true);
            }}
          >
            <div className="aspect-square w-full bg-[#F5EAEA]/30 relative overflow-hidden rounded-t-[2rem]">
              {item.imageBase64 ? (
                <img src={item.imageBase64} alt={item.title} className="object-cover w-full h-full" />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-gray-300">
                  <Camera className="h-16 w-16 opacity-30" />
                </div>
              )}
              {item.status === '受取済' && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                  <span className="bg-white/90 text-[#8A1A22] px-6 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg">
                    <CheckCircle2 className="w-5 h-5" />
                    受取済
                  </span>
                </div>
              )}
            </div>
            <CardContent className="p-6">
              <h3 className="font-bold text-xl text-gray-800 line-clamp-1 mb-2">{item.title}</h3>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#8A1A22] bg-[#F5EAEA] px-3 py-1 rounded-full">
                  {item.category}
                </span>
                <span className="text-xs text-gray-400">
                  {item.createdAt ? format(item.createdAt.toDate(), 'yyyy/MM/dd') : '...'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FCF8F8] pb-24 font-sans">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-[#F0E6E6] sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <School className="w-8 h-8 text-[#8A1A22]" />
            <h1 className="text-xl font-serif font-bold text-[#8A1A22] tracking-wide">
              自由学園 落とし物掲示板
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {user ? (
              <>
                <span className="text-sm font-medium text-gray-600 hidden sm:inline-block bg-gray-50 px-3 py-1.5 rounded-full">{user.displayName}</span>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => setIsAdminOpen(true)} className="rounded-full border-[#8A1A22]/20 text-[#8A1A22] hover:bg-[#F5EAEA] hover:text-[#8A1A22]">
                    <Settings className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">管理</span>
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={handleLogout} title="ログアウト" className="rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <Button className="h-10 px-6 rounded-full font-bold shadow-sm bg-[#8A1A22] hover:bg-[#6D141A] transition-colors" onClick={() => setShowLogin(true)}>
                <UserCircle className="w-5 h-5 mr-2" />
                ログイン
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8 space-y-6">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400 group-focus-within:text-[#8A1A22] transition-colors" />
            <Input 
              placeholder="落とし物を検索... (例: けしごむ、水筒)" 
              className="pl-14 h-16 text-lg rounded-full bg-white border-0 shadow-sm focus-visible:ring-2 focus-visible:ring-[#8A1A22]/30 transition-shadow"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 gap-3 hide-scrollbar">
            <Button 
              className={`rounded-full px-6 h-12 text-base font-medium whitespace-nowrap transition-all ${activeCategory === 'すべて' ? 'bg-[#8A1A22] text-white shadow-md hover:bg-[#6D141A]' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 shadow-sm'}`}
              onClick={() => setActiveCategory('すべて')}
            >
              すべて
            </Button>
            {categories.map(cat => (
              <Button 
                key={cat}
                className={`rounded-full px-6 h-12 text-base font-medium whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-[#8A1A22] text-white shadow-md hover:bg-[#6D141A]' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 shadow-sm'}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {renderItemList()}
      </main>

      {/* Floating Action Button for Posting */}
      {user && (
        <Dialog open={isPosting} onOpenChange={setIsPosting}>
          <DialogTrigger asChild>
            <Button 
              className="fixed bottom-8 right-8 h-16 w-16 rounded-[1.5rem] bg-[#8A1A22] hover:bg-[#6D141A] shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95" 
              size="icon"
            >
              <Plus className="h-8 w-8 text-white" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] sm:rounded-[2rem] max-h-[90vh] overflow-y-auto border-0 shadow-2xl bg-white p-6 sm:p-8">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl font-bold text-gray-800">落とし物を投稿</DialogTitle>
            <DialogDescription className="text-gray-500">
              見つけた落とし物の情報を入力してください。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="image" className="font-semibold text-gray-700">写真</Label>
              <div className="border-2 border-dashed border-[#E5D5D5] bg-[#FCF8F8] rounded-[1.5rem] p-6 text-center transition-colors hover:bg-[#F5EAEA]/50">
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="max-h-56 mx-auto rounded-xl shadow-sm" />
                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="sm" 
                      className="absolute top-2 right-2 rounded-full shadow-md"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                      }}
                    >
                      削除
                    </Button>
                  </div>
                ) : (
                  <div className="py-8 flex flex-col items-center text-gray-400 space-y-4">
                    <Camera className="h-12 w-12 opacity-50 text-[#8A1A22]" />
                    <div className="flex gap-3 justify-center flex-wrap">
                      <Button type="button" variant="outline" className="rounded-full bg-white border-gray-200" onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon className="w-4 h-4 mr-2" />
                        ライブラリから選ぶ
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full bg-white border-gray-200" onClick={() => cameraInputRef.current?.click()}>
                        <Camera className="w-4 h-4 mr-2" />
                        写真を撮る
                      </Button>
                    </div>
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleImageChange}
                />
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  ref={cameraInputRef}
                  onChange={handleImageChange}
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <Label htmlFor="title" className="font-semibold text-gray-700">タイトル (必須)</Label>
              <Input 
                id="title" 
                placeholder="例: 黒い筆箱、青い水筒など" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={50}
                className="h-12 rounded-xl bg-gray-50 border-gray-200 focus-visible:ring-[#8A1A22]"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="category" className="font-semibold text-gray-700">区分 (必須)</Label>
              <Select value={category} onValueChange={(value) => setCategory(value)}>
                <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200 focus:ring-[#8A1A22]">
                  <SelectValue placeholder="区分を選択" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-gray-100 shadow-xl">
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat} className="rounded-lg">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label htmlFor="searchKeywords" className="font-semibold text-gray-700">検索用キーワード・ふりがな (任意)</Label>
              <Input 
                id="searchKeywords" 
                placeholder="例: けしごむ、MONO、青色" 
                value={searchKeywords}
                onChange={(e) => setSearchKeywords(e.target.value)}
                maxLength={100}
                className="h-12 rounded-xl bg-gray-50 border-gray-200 focus-visible:ring-[#8A1A22]"
              />
              <p className="text-xs text-gray-500 ml-1">ひらがなで入力しておくと、検索されやすくなります。</p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="description" className="font-semibold text-gray-700">詳細 (任意)</Label>
              <Textarea 
                id="description" 
                placeholder="見つけた場所や特徴など" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={200}
                className="rounded-xl bg-gray-50 border-gray-200 focus-visible:ring-[#8A1A22] resize-none"
              />
            </div>

            <DialogFooter className="pt-6 border-t border-gray-100">
              <Button type="button" variant="outline" className="rounded-full h-12 px-6" onClick={() => setIsPosting(false)} disabled={isSubmitting}>
                キャンセル
              </Button>
              <Button type="submit" className="rounded-full h-12 px-8 bg-[#8A1A22] hover:bg-[#6D141A] shadow-md" disabled={!title || isSubmitting}>
                {isSubmitting ? '投稿中...' : '投稿する'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[500px] sm:rounded-[2rem] max-h-[90vh] overflow-y-auto p-0 border-0 shadow-2xl">
          {selectedItem && (
            <>
              <div className="relative w-full bg-[#F5EAEA]/30">
                {selectedItem.imageBase64 ? (
                  <img src={selectedItem.imageBase64} alt={selectedItem.title} className="w-full h-auto max-h-[45vh] object-contain rounded-t-[2rem]" />
                ) : (
                  <div className="flex items-center justify-center w-full h-56 text-gray-300">
                    <Camera className="h-16 w-16 opacity-30" />
                  </div>
                )}
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-white/90 backdrop-blur-md text-[#8A1A22] px-4 py-1.5 rounded-full text-sm font-bold shadow-sm">
                    {selectedItem.category}
                  </span>
                  {selectedItem.status === '受取済' && (
                    <span className="bg-[#8A1A22] text-white px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5 shadow-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      受取済
                    </span>
                  )}
                </div>
              </div>
              
              <div className="p-8 space-y-6 bg-white">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">{selectedItem.title}</h2>
                  <div className="flex flex-col gap-1 mt-3">
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <span className="w-16 text-gray-400">投稿日時</span>
                      {selectedItem.createdAt ? format(selectedItem.createdAt.toDate(), 'yyyy年MM月dd日 HH:mm') : '...'}
                    </p>
                    <p className="text-sm text-gray-500 flex items-center gap-2">
                      <span className="w-16 text-gray-400">発見者</span>
                      <span className="font-medium">{selectedItem.authorName}</span>
                    </p>
                  </div>
                </div>

                {selectedItem.description && (
                  <div className="bg-[#FCF8F8] p-5 rounded-2xl border border-[#F5EAEA]">
                    <p className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">{selectedItem.description}</p>
                  </div>
                )}

                {selectedItem.claimedByUid && selectedItem.status === '未受取' && (
                  <div className="bg-blue-50/80 border border-blue-100 text-blue-800 p-4 rounded-2xl text-sm flex items-start gap-3">
                    <UserCheck className="w-5 h-5 mt-0.5 shrink-0" />
                    <span className="font-medium leading-relaxed">{selectedItem.claimedByName}さんが「自分のもの」として名乗り出ています。</span>
                  </div>
                )}

                <div className="pt-6 flex flex-col gap-3 border-t border-gray-100">
                  {user && user.uid !== selectedItem.authorUid && !isAdmin && !selectedItem.claimedByUid && selectedItem.status === '未受取' && (
                    <Button 
                      className="w-full rounded-full h-14 text-base font-bold bg-[#8A1A22] hover:bg-[#6D141A] shadow-md" 
                      size="lg"
                      onClick={() => handleClaim(selectedItem)}
                    >
                      <Hand className="w-5 h-5 mr-2" />
                      私のです！（受け取りに行きます）
                    </Button>
                  )}

                  {user && (user.uid === selectedItem.authorUid || isAdmin || user.uid === selectedItem.claimedByUid) && selectedItem.status === '未受取' && (
                    <Button 
                      className="w-full rounded-full h-14 text-base font-bold bg-gray-800 hover:bg-gray-900 shadow-md" 
                      size="lg"
                      onClick={() => handleMarkAsReceived(selectedItem)}
                    >
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      {user.uid === selectedItem.claimedByUid ? '受け取りました（受取済にする）' : '持ち主に渡した（受取済にする）'}
                    </Button>
                  )}
                  
                  {user && (user.uid === selectedItem.authorUid || isAdmin) && (
                    <Button 
                      variant="ghost" 
                      className="w-full rounded-full h-12 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(selectedItem)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      この投稿を削除する
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Admin Modal */}
      {isAdmin && (
        <Dialog open={isAdminOpen} onOpenChange={setIsAdminOpen}>
          <DialogContent className="sm:max-w-[400px] sm:rounded-[2rem] border-0 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">管理者設定</DialogTitle>
              <DialogDescription>
                区分の追加・削除ができます。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 mt-2">
              <div className="space-y-3">
                <Label className="font-semibold text-gray-700">現在の区分</Label>
                <div className="space-y-2">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center justify-between bg-gray-50 border border-gray-100 p-3 px-4 rounded-xl">
                      <span className="font-medium">{cat}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCategory(cat)} className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg">
                        削除
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 pt-6 border-t border-gray-100">
                <Label htmlFor="newCategory" className="font-semibold text-gray-700">新しい区分を追加</Label>
                <div className="flex gap-2">
                  <Input 
                    id="newCategory" 
                    placeholder="例: 初等部、学部" 
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="h-12 rounded-xl focus-visible:ring-[#8A1A22]"
                  />
                  <Button onClick={handleAddCategory} disabled={!newCategory.trim()} className="h-12 px-6 rounded-xl bg-[#8A1A22] hover:bg-[#6D141A]">
                    追加
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}