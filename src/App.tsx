import React, { useEffect, useState, useRef } from 'react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { Camera, LogOut, Plus, Search, CheckCircle2, Trash2, School, Image as ImageIcon, UserCircle, Hand, UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [showLogin, setShowLogin] = useState(false);
  
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
    if (selectedItem) {
      const updatedItem = items.find(item => item.id === selectedItem.id);
      if (updatedItem) {
        setSelectedItem(updatedItem);
      }
    }
  }, [items]);

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
      setCategory('高等部');
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

  if (!isAuthReady) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (showLogin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
          <div className="bg-slate-900 p-8 text-center">
            <School className="w-16 h-16 text-white mx-auto mb-4" />
            <h1 className="text-2xl font-serif text-white tracking-wider">自由学園</h1>
            <p className="text-slate-300 text-sm mt-2 tracking-widest">落とし物管理システム</p>
          </div>
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-lg font-medium text-slate-800">教職員・生徒用ログイン</h2>
              <p className="text-sm text-slate-500">
                投稿および管理機能を利用するには、<br/>学校のメールアドレスでログインしてください。
              </p>
            </div>
            
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {authError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm text-center">
                  {authError}
                </div>
              )}
              
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="name">お名前（表示名）</Label>
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    required={isSignUp} 
                    placeholder="例: 自由 太郎" 
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">学校のメールアドレス</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  placeholder="xxx@jiyu.ac.jp" 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">パスワード（6文字以上）</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  placeholder="••••••••" 
                />
              </div>
              
              <Button type="submit" className="w-full h-12 text-lg bg-slate-900 hover:bg-slate-800">
                {isSignUp ? '新規登録' : 'ログイン'}
              </Button>
            </form>

            <div className="text-center space-y-2 pt-2">
              <Button 
                variant="link" 
                onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }} 
                className="text-slate-600 text-sm"
              >
                {isSignUp ? 'すでにアカウントをお持ちの方はこちら' : '初めての方はこちら（新規登録）'}
              </Button>
              <div className="w-full border-t border-slate-100 my-2"></div>
              <Button variant="ghost" onClick={() => setShowLogin(false)} className="text-slate-500">
                ログインせずに閲覧する
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderItemList = (categoryFilter: '高等部' | '中等部') => {
    const filteredItems = items.filter(item => item.category === categoryFilter);
    
    if (filteredItems.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="mx-auto h-12 w-12 opacity-20 mb-4" />
          <p>まだ落とし物の投稿はありません。</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filteredItems.map(item => (
          <Card 
            key={item.id} 
            className={`cursor-pointer transition-all hover:shadow-md ${item.status === '受取済' ? 'opacity-60 grayscale' : ''}`}
            onClick={() => {
              setSelectedItem(item);
              setIsDetailOpen(true);
            }}
          >
            <div className="aspect-square w-full bg-muted relative overflow-hidden rounded-t-xl">
              {item.imageBase64 ? (
                <img src={item.imageBase64} alt={item.title} className="object-cover w-full h-full" />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                  <Camera className="h-12 w-12 opacity-20" />
                </div>
              )}
              {item.status === '受取済' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    受取済
                  </span>
                </div>
              )}
            </div>
            <CardContent className="p-4">
              <h3 className="font-semibold text-lg line-clamp-1">{item.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {item.createdAt ? format(item.createdAt.toDate(), 'yyyy/MM/dd HH:mm') : '...'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <School className="w-6 h-6" />
            落とし物掲示板
          </h1>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm text-muted-foreground hidden sm:inline-block">{user.displayName}</span>
                <Button variant="ghost" size="icon" onClick={handleLogout} title="ログアウト">
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowLogin(true)}>
                <UserCircle className="w-4 h-4 mr-2" />
                ログイン
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Tabs defaultValue="高等部" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="高等部">高等部</TabsTrigger>
            <TabsTrigger value="中等部">中等部</TabsTrigger>
          </TabsList>
          <TabsContent value="高等部">
            {renderItemList('高等部')}
          </TabsContent>
          <TabsContent value="中等部">
            {renderItemList('中等部')}
          </TabsContent>
        </Tabs>
      </main>

      {/* Floating Action Button for Posting */}
      {user && (
        <Dialog open={isPosting} onOpenChange={setIsPosting}>
          <DialogTrigger asChild>
            <Button 
              className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg" 
              size="icon"
            >
              <Plus className="h-6 w-6" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>落とし物を投稿</DialogTitle>
            <DialogDescription>
              見つけた落とし物の情報を入力してください。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="image">写真</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center">
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded" />
                    <Button 
                      type="button" 
                      variant="destructive" 
                      size="sm" 
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                      }}
                    >
                      削除
                    </Button>
                  </div>
                ) : (
                  <div className="py-6 flex flex-col items-center text-muted-foreground space-y-4">
                    <Camera className="h-10 w-10 opacity-50" />
                    <div className="flex gap-3 justify-center">
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                        <ImageIcon className="w-4 h-4 mr-2" />
                        ライブラリから選ぶ
                      </Button>
                      <Button type="button" variant="outline" onClick={() => cameraInputRef.current?.click()}>
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
            
            <div className="space-y-2">
              <Label htmlFor="title">タイトル (必須)</Label>
              <Input 
                id="title" 
                placeholder="例: 黒い筆箱、青い水筒など" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">区分 (必須)</Label>
              <Select value={category} onValueChange={(value: '高等部' | '中等部') => setCategory(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="区分を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="高等部">高等部</SelectItem>
                  <SelectItem value="中等部">中等部</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">詳細 (任意)</Label>
              <Textarea 
                id="description" 
                placeholder="見つけた場所や特徴など" 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={200}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsPosting(false)} disabled={isSubmitting}>
                キャンセル
              </Button>
              <Button type="submit" disabled={!title || isSubmitting}>
                {isSubmitting ? '投稿中...' : '投稿する'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      )}

      {/* Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-0">
          {selectedItem && (
            <>
              <div className="relative w-full bg-muted">
                {selectedItem.imageBase64 ? (
                  <img src={selectedItem.imageBase64} alt={selectedItem.title} className="w-full h-auto max-h-[40vh] object-contain" />
                ) : (
                  <div className="flex items-center justify-center w-full h-48 text-muted-foreground">
                    <Camera className="h-12 w-12 opacity-20" />
                  </div>
                )}
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-background/80 backdrop-blur-sm text-foreground px-3 py-1 rounded-full text-xs font-medium">
                    {selectedItem.category}
                  </span>
                  {selectedItem.status === '受取済' && (
                    <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      受取済
                    </span>
                  )}
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">{selectedItem.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    投稿日: {selectedItem.createdAt ? format(selectedItem.createdAt.toDate(), 'yyyy年MM月dd日 HH:mm') : '...'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    投稿者: {selectedItem.authorName}
                  </p>
                </div>

                {selectedItem.description && (
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p className="whitespace-pre-wrap text-sm">{selectedItem.description}</p>
                  </div>
                )}

                {selectedItem.claimedByUid && selectedItem.status === '未受取' && (
                  <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm flex items-center gap-2">
                    <UserCheck className="w-5 h-5" />
                    {selectedItem.claimedByName}さんが「自分のもの」として名乗り出ています。
                  </div>
                )}

                <div className="pt-4 flex flex-col gap-3">
                  {user && user.uid !== selectedItem.authorUid && !isAdmin && !selectedItem.claimedByUid && selectedItem.status === '未受取' && (
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700" 
                      size="lg"
                      onClick={() => handleClaim(selectedItem)}
                    >
                      <Hand className="w-5 h-5 mr-2" />
                      私のです！（受け取りに行きます）
                    </Button>
                  )}

                  {user && (user.uid === selectedItem.authorUid || isAdmin || user.uid === selectedItem.claimedByUid) && selectedItem.status === '未受取' && (
                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={() => handleMarkAsReceived(selectedItem)}
                    >
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      {user.uid === selectedItem.claimedByUid ? '受け取りました（受取済にする）' : '持ち主に渡した（受取済にする）'}
                    </Button>
                  )}
                  
                  {user && (user.uid === selectedItem.authorUid || isAdmin) && (
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      onClick={() => handleDelete(selectedItem)}
                    >
                      <Trash2 className="w-5 h-5 mr-2" />
                      この投稿を削除する
                    </Button>
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
