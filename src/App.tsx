import React, { useEffect, useState, useRef } from 'react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { Camera, LogOut, Plus, Search, CheckCircle2, Trash2 } from 'lucide-react';

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
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [items, setItems] = useState<LostItem[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  
  // Post Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'高等部' | '中等部'>('高等部');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!isAuthReady || !user) return;

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

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
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
    if (!user) return;
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

  const handleDelete = async (item: LostItem) => {
    if (!user || user.uid !== item.authorUid) return;
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

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-primary">学校の落とし物掲示板</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            <p className="text-muted-foreground text-center">
              学校アカウントでログインして、落とし物を探したり投稿したりできます。
            </p>
            <Button onClick={handleLogin} className="w-full" size="lg">
              Googleでログイン
            </Button>
          </CardContent>
        </Card>
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
          <h1 className="text-xl font-bold text-primary">落とし物掲示板</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">{user.displayName}</span>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="ログアウト">
              <LogOut className="h-5 w-5" />
            </Button>
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
              <div 
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded" />
                ) : (
                  <div className="py-6 flex flex-col items-center text-muted-foreground">
                    <Camera className="h-10 w-10 mb-2 opacity-50" />
                    <span>タップして写真を撮影・選択</span>
                  </div>
                )}
                <input 
                  type="file" 
                  id="image" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef}
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

                <div className="pt-4 flex flex-col gap-3">
                  {selectedItem.status === '未受取' && (
                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={() => handleMarkAsReceived(selectedItem)}
                    >
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      持ち主に渡した（受取済にする）
                    </Button>
                  )}
                  
                  {user.uid === selectedItem.authorUid && (
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
