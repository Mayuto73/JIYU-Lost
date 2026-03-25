import React, { useEffect, useState, useRef, useMemo } from 'react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { Camera, LogOut, Plus, Search, CheckCircle2, Trash2, School, Image as ImageIcon, UserCircle, Hand, UserCheck, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { resizeImage } from './lib/imageUtils';

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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [items, setItems] = useState<LostItem[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [showLogin, setShowLogin] = useState(true); // 初期値をtrueに
  
  // 検索・フィルタリング用ステート
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'高等部' | '中等部'>('高等部');

  const isAdmin = user?.email === 'admin1921@jiyu.ac.jp';

  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // Post Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'高等部' | '中等部'>('高等部');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Detail Modal State
  const [selectedItem, setSelectedItem] = useState<LostItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) setShowLogin(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'lost_items'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LostItem[];
      setItems(fetchedItems);
    }, (error) => console.error("Error fetching items:", error));
    return () => unsubscribe();
  }, []);

  // 検索とカテゴリでフィルタリングされたアイテム
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesCategory = item.category === activeTab;
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (item.description?.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [items, activeTab, searchQuery]);

  const handleLogout = async () => { try { await signOut(auth); } catch (e) { console.error(e); } };
  
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const allowedDomains = ['@jiyu.ac.jp', '@prf.jiyu.ac.jp', '@std.jiyu.ac.jp'];
    if (!allowedDomains.some(domain => email.endsWith(domain))) {
      setAuthError('自由学園のメールアドレスを使用してください。');
      return;
    }
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        setUser({ ...userCredential.user, displayName: name } as User);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setShowLogin(false);
    } catch (error: any) { setAuthError('メールアドレスまたはパスワードが正しくありません。'); }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title) return;
    setIsSubmitting(true);
    try {
      let imageBase64 = imageFile ? await resizeImage(imageFile, 800, 800) : '';
      await addDoc(collection(db, 'lost_items'), {
        title, description, imageBase64, category,
        status: '未受取', authorUid: user.uid,
        authorName: user.displayName || 'Anonymous',
        createdAt: serverTimestamp()
      });
      setTitle(''); setDescription(''); setImagePreview(null); setIsPosting(false);
    } catch (e) { alert("投稿に失敗しました。"); } finally { setIsSubmitting(false); }
  };

  const handleMarkAsReceived = async (item: LostItem) => {
    if (!window.confirm("受取済にしますか？")) return;
    await updateDoc(doc(db, 'lost_items', item.id), { status: '受取済' });
    setIsDetailOpen(false);
  };

  const handleClaim = async (item: LostItem) => {
    if (!window.confirm("自分のものとして通知しますか？")) return;
    await updateDoc(doc(db, 'lost_items', item.id), {
      claimedByUid: user?.uid,
      claimedByName: user?.displayName || '名無し'
    });
  };

  const handleDelete = async (item: LostItem) => {
    if (!window.confirm("削除してもよろしいですか？")) return;
    await deleteDoc(doc(db, 'lost_items', item.id));
    setIsDetailOpen(false);
  };

  if (!isAuthReady) return <div className="flex items-center justify-center min-h-screen text-[#9d1636]">Loading...</div>;

  if (showLogin && !user) {
    return (
      <div className="min-h-screen bg-[#fffbff] flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[32px] shadow-sm border border-pink-100 overflow-hidden">
          <div className="bg-[#9d1636] p-10 text-center">
            <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
              <School className="w-10 h-10 text-[#9d1636]" />
            </div>
            <h1 className="text-3xl font-serif text-white tracking-widest">自由学園</h1>
            <p className="text-pink-100 text-xs mt-2 tracking-[0.3em] uppercase opacity-80 font-bold">Lost & Found System</p>
          </div>
          <div className="p-8 space-y-6">
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {authError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm text-center font-medium">{authError}</div>}
              {isSignUp && (
                <div className="space-y-1">
                  <Label className="ml-1 text-xs text-gray-500 font-bold">お名前</Label>
                  <Input className="rounded-2xl border-gray-200 h-12 focus-visible:ring-[#9d1636]" value={name} onChange={e => setName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-1">
                <Label className="ml-1 text-xs text-gray-500 font-bold">学園メールアドレス</Label>
                <Input type="email" placeholder="xxx@jiyu.ac.jp" className="rounded-2xl border-gray-200 h-12 focus-visible:ring-[#9d1636]" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label className="ml-1 text-xs text-gray-500 font-bold">パスワード</Label>
                <Input type="password" placeholder="••••••••" className="rounded-2xl border-gray-200 h-12 focus-visible:ring-[#9d1636]" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full h-14 rounded-full bg-[#9d1636] hover:bg-[#800000] text-lg font-bold shadow-md transition-all">
                {isSignUp ? '登録する' : 'ログイン'}
              </Button>
            </form>
            <div className="flex flex-col gap-2 text-center">
              <Button variant="link" onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }} className="text-[#9d1636] font-bold">
                {isSignUp ? 'アカウントをお持ちの方はこちら' : '初めての方はこちら（新規登録）'}
              </Button>
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-gray-100"></span></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">または</span></div>
              </div>
              <Button variant="ghost" onClick={() => setShowLogin(false)} className="text-gray-500 hover:text-[#9d1636] rounded-full h-12 font-medium">
                ログインせずに閲覧する
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffbff] text-[#201a1a] pb-24">
      <header className="bg-white/90 backdrop-blur-md sticky top-0 z-30 px-6 py-4 border-b border-pink-50 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#9d1636] rounded-xl flex items-center justify-center shadow-sm">
              <School className="text-white w-6 h-6" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-serif font-bold tracking-tight text-[#9d1636]">自由学園</h1>
              <p className="text-[10px] tracking-[0.2em] text-gray-400 uppercase font-bold">Lost & Found</p>
            </div>
          </div>
          
          {/* 検索バー */}
          <div className="flex-1 max-w-sm mx-4 relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-[#9d1636] transition-colors" />
            <Input 
              placeholder="落とし物を検索..." 
              className="w-full pl-10 pr-10 rounded-full bg-gray-50 border-none focus-visible:ring-2 focus-visible:ring-[#9d1636]/20 h-10 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2 bg-pink-50 pl-4 pr-1 py-1 rounded-full border border-pink-100">
                <span className="text-xs font-bold text-[#9d1636] hidden md:inline">{user.displayName}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white text-[#9d1636]" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="rounded-full border-[#9d1636] text-[#9d1636] px-6" onClick={() => setShowLogin(true)}>
                ログイン
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
          <div>
            <h2 className="text-3xl font-serif font-bold mb-2">落とし物掲示板</h2>
            <p className="text-sm text-gray-500 font-medium">
              {searchQuery ? `"${searchQuery}" の検索結果: ${filteredItems.length}件` : `${activeTab}の落とし物一覧`}
            </p>
          </div>

          {/* 切り替えやすさを重視した大型タブ */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full md:w-auto">
            <TabsList className="bg-gray-100 p-1.5 rounded-[24px] border border-gray-200 w-full md:w-[320px] h-14">
              <TabsTrigger value="高等部" className="flex-1 rounded-[20px] text-base font-bold data-[state=active]:bg-[#9d1636] data-[state=active]:text-white data-[state=active]:shadow-lg transition-all">
                高等部
              </TabsTrigger>
              <TabsTrigger value="中等部" className="flex-1 rounded-[20px] text-base font-bold data-[state=active]:bg-[#9d1636] data-[state=active]:text-white data-[state=active]:shadow-lg transition-all">
                中等部
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-gray-200">
            <Search className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">該当する落とし物が見つかりません</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {filteredItems.map(item => (
              <Card key={item.id} 
                className={`group overflow-hidden rounded-[28px] border-none shadow-sm hover:shadow-xl transition-all cursor-pointer bg-white ${item.status === '受取済' ? 'opacity-60 grayscale-[0.5]' : ''}`}
                onClick={() => { setSelectedItem(item); setIsDetailOpen(true); }}
              >
                <div className="aspect-[4/3] relative overflow-hidden bg-gray-50">
                  {item.imageBase64 ? (
                    <img src={item.imageBase64} alt={item.title} className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full text-gray-200">
                      <ImageIcon className="h-12 w-12" />
                    </div>
                  )}
                  {item.status === '受取済' && (
                    <div className="absolute inset-0 bg-[#9d1636]/20 flex items-center justify-center backdrop-blur-[2px]">
                      <span className="bg-white text-[#9d1636] px-5 py-2 rounded-full text-sm font-bold shadow-xl border border-[#9d1636]/10">受取完了</span>
                    </div>
                  )}
                </div>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <h3 className="font-bold text-lg leading-tight group-hover:text-[#9d1636] transition-colors line-clamp-1">{item.title}</h3>
                    {item.claimedByUid && item.status === '未受取' && <Sparkles className="w-5 h-5 text-amber-500 shrink-0 animate-bounce" />}
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">
                      {item.createdAt ? format(item.createdAt.toDate(), 'yyyy.MM.dd') : '---'}
                    </p>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-md font-bold uppercase tracking-tighter">{item.category}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* FAB */}
      {user && (
        <Button 
          className="fixed bottom-8 right-8 h-16 w-16 rounded-[24px] shadow-2xl bg-[#9d1636] hover:bg-[#800000] text-white transition-all hover:scale-110 active:scale-95 z-40" 
          size="icon"
          onClick={() => setIsPosting(true)}
        >
          <Plus className="h-8 w-8" />
        </Button>
      )}

      {/* 詳細・投稿ダイアログは既存のExpressiveデザインを維持（以下、共通パーツ） */}
      {/* ... (Dialogの内容は変更なし) ... */}
      
      {/* Post Modal */}
      <Dialog open={isPosting} onOpenChange={setIsPosting}>
        <DialogContent className="sm:max-w-[500px] rounded-[32px] p-8 border-none overflow-hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif text-[#9d1636]">落とし物を届ける</DialogTitle>
            <DialogDescription>見つけた場所や特徴を入力してください。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="space-y-2">
              <div className={`border-2 border-dashed rounded-[24px] p-4 text-center transition-colors ${imagePreview ? 'border-[#9d1636] bg-pink-50' : 'border-gray-200'}`}>
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="max-h-40 mx-auto rounded-xl shadow-md" />
                    <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-8 w-8 rounded-full" onClick={() => { setImageFile(null); setImagePreview(null); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="py-4 flex flex-col items-center gap-3">
                    <Camera className="h-8 w-8 text-gray-300" />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="rounded-full text-xs font-bold" onClick={() => fileInputRef.current?.click()}>ライブラリ</Button>
                      <Button type="button" variant="outline" className="rounded-full text-xs font-bold" onClick={() => cameraInputRef.current?.click()}>カメラ起動</Button>
                    </div>
                  </div>
                )}
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageChange} />
                <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleImageChange} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-500 ml-1">品物の名前</Label>
              <Input placeholder="例: 青いチェックのマフラー" className="rounded-xl border-gray-200 h-12 focus-visible:ring-[#9d1636]" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-500 ml-1">区分</Label>
              <Select value={category} onValueChange={(value: '高等部' | '中等部') => setCategory(value)}>
                <SelectTrigger className="rounded-xl border-gray-200 h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="高等部">高等部</SelectItem>
                  <SelectItem value="中等部">中等部</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-gray-500 ml-1">備考（場所など）</Label>
              <Textarea placeholder="例: 食堂の椅子の下にありました" className="rounded-xl border-gray-200 min-h-[100px] focus-visible:ring-[#9d1636]" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <DialogFooter className="sm:justify-between gap-3 pt-4">
              <Button type="button" variant="ghost" className="rounded-full flex-1 font-bold" onClick={() => setIsPosting(false)}>キャンセル</Button>
              <Button type="submit" disabled={!title || isSubmitting} className="rounded-full flex-1 bg-[#9d1636] hover:bg-[#800000] font-bold shadow-lg shadow-pink-100">
                {isSubmitting ? '送信中...' : '投稿を完了する'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden rounded-[32px] border-none shadow-2xl bg-white max-h-[95vh] overflow-y-auto">
          {selectedItem && (
            <div className="flex flex-col">
              <div className="relative aspect-video bg-gray-100 overflow-hidden">
                {selectedItem.imageBase64 ? (
                  <img src={selectedItem.imageBase64} alt={selectedItem.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-gray-300 bg-pink-50/30">
                    <ImageIcon className="h-16 w-16" />
                  </div>
                )}
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-[#9d1636] text-white px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-lg">
                    {selectedItem.category}
                  </span>
                </div>
              </div>
              
              <div className="p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-[#201a1a] mb-2">{selectedItem.title}</h2>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-gray-400">
                      <UserCircle className="w-4 h-4 text-[#9d1636]/40" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">拾得者: {selectedItem.authorName}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-medium">
                      {selectedItem.createdAt ? format(selectedItem.createdAt.toDate(), 'yyyy年MM月dd日 HH:mm 登録') : '...'}
                    </p>
                  </div>
                </div>

                {selectedItem.description && (
                  <div className="bg-pink-50/30 p-5 rounded-[24px] border border-pink-100/50">
                    <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">{selectedItem.description}</p>
                  </div>
                )}

                {selectedItem.claimedByUid && selectedItem.status === '未受取' && (
                  <div className="bg-amber-50 text-amber-800 p-4 rounded-2xl text-xs font-bold flex items-center gap-3 border border-amber-100 shadow-sm animate-pulse">
                    <UserCheck className="w-5 h-5 shrink-0" />
                    <span>{selectedItem.claimedByName}さんが「自分のもの」と名乗り出ています。</span>
                  </div>
                )}

                <div className="flex flex-col gap-3 pt-4">
                  {user && user.uid !== selectedItem.authorUid && !isAdmin && !selectedItem.claimedByUid && selectedItem.status === '未受取' && (
                    <Button className="w-full h-14 rounded-full bg-blue-600 hover:bg-blue-700 font-bold text-white shadow-lg shadow-blue-100" onClick={() => handleClaim(selectedItem)}>
                      <Hand className="w-5 h-5 mr-2" />
                      これ、私のものです！
                    </Button>
                  )}

                  {user && (user.uid === selectedItem.authorUid || isAdmin || user.uid === selectedItem.claimedByUid) && selectedItem.status === '未受取' && (
                    <Button className="w-full h-14 rounded-full bg-[#9d1636] hover:bg-[#800000] font-bold shadow-lg shadow-pink-100 text-white" onClick={() => handleMarkAsReceived(selectedItem)}>
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      {user.uid === selectedItem.claimedByUid ? '受け取りました' : '持ち主に返却しました'}
                    </Button>
                  )}
                  
                  {user && (user.uid === selectedItem.authorUid || isAdmin) && (
                    <Button variant="ghost" className="text-gray-400 hover:text-red-500 rounded-full h-12 font-bold" onClick={() => handleDelete(selectedItem)}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      この投稿を削除する
                    </Button>
                  )}
                  
                  {!user && (
                    <p className="text-center text-xs text-gray-400 font-medium bg-gray-50 py-3 rounded-xl border border-dashed">
                      各種手続きにはログインが必要です
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
