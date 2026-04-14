import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Square, Settings, Shuffle, Volume2, VolumeX, Trophy, Star, Plus, Search, ChevronLeft, ChevronRight, FileText, Download, Upload, Moon, Sun, Check, CheckCircle, XCircle, Save, LogOut, Mail, Lock, UserPlus, LogIn } from 'lucide-react';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';

// --- TRÌNH TẠO ÂM THANH (WEB AUDIO API) ---
// Lazy init để tránh lỗi autoplay của trình duyệt
let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
};

const playTone = (freq: number, type: OscillatorType, duration: number, vol = 0.1) => {
  try {
    const ctx = initAudio();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gainNode.gain.setValueAtTime(vol, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn("Audio play failed", e);
  }
};

const sounds = {
  hover: () => playTone(800, 'sine', 0.1, 0.02),
  correct: () => {
    playTone(440, 'sine', 0.1, 0.1);
    setTimeout(() => playTone(554, 'sine', 0.1, 0.1), 100);
    setTimeout(() => playTone(659, 'sine', 0.2, 0.1), 200);
    setTimeout(() => playTone(880, 'sine', 0.4, 0.15), 300);
  },
  wrong: () => {
    playTone(300, 'sawtooth', 0.2, 0.1);
    setTimeout(() => playTone(250, 'sawtooth', 0.4, 0.1), 200);
  },
  congrats: () => {
    [440, 554, 659, 880, 1108].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 'square', 0.2, 0.1), i * 150);
    });
  }
};

// --- DỮ LIỆU MẪU BAN ĐẦU ---
interface Question {
  id: number;
  text: string;
  options: string[];
  correctIndex: number;
}

interface TFQuestion {
  id: number;
  text: string;
  isTrue: boolean;
}

interface SAQuestion {
  id: number;
  text: string;
  correctAnswer: string;
}

interface Student {
  id: string;
  name: string;
  score: number;
  class_id?: string;
}

const initialQuestions: Question[] = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  text: `Câu hỏi số ${i + 1}: Điền vào chỗ trống...`,
  options: ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'],
  correctIndex: 0
}));

const initialTFQuestions: TFQuestion[] = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  text: `Câu hỏi Đúng/Sai số ${i + 1}: Mệnh đề này là đúng hay sai?`,
  isTrue: true
}));

const initialSAQuestions: SAQuestion[] = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  text: `Câu hỏi Trả lời ngắn số ${i + 1}: ...`,
  correctAnswer: 'Đáp án'
}));

export default function App() {
  // States: Danh sách & Lớp học
  const [classesData, setClassesData] = useState<Record<string, Student[]>>({
    '9B': [
      { id: '1', name: 'Nguyễn Văn A', score: 20 },
      { id: '2', name: 'Trần Thị B', score: 10 },
      { id: '3', name: 'Lê Hoàng C', score: 30 },
      { id: '4', name: 'Phạm Thị D', score: 10 },
    ]
  });
  const [currentClass, setCurrentClass] = useState('9B');
  const [newClassName, setNewClassName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const STUDENTS_PER_PAGE = 10;
  
  const students = classesData[currentClass] || [];
  const [newStudentName, setNewStudentName] = useState('');

  // States: Import/Export
  const [showImportListModal, setShowImportListModal] = useState(false);
  const [importText, setImportText] = useState('');
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  // States: Bảng câu hỏi & Trò chơi
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [balls, setBalls] = useState<number[]>(Array.from({ length: 60 }, (_, i) => i + 1));
  const [answeredBalls, setAnsweredBalls] = useState<number[]>([]);

  // States: Bảng câu hỏi Đúng/Sai
  const [tfQuestions, setTfQuestions] = useState<TFQuestion[]>(initialTFQuestions);
  const [tfBalls, setTfBalls] = useState<number[]>(Array.from({ length: 60 }, (_, i) => i + 1));
  const [answeredTFBalls, setAnsweredTFBalls] = useState<number[]>([]);

  // States: Bảng câu hỏi Trả lời ngắn
  const [saQuestions, setSaQuestions] = useState<SAQuestion[]>(initialSAQuestions);
  const [saBalls, setSaBalls] = useState<number[]>(Array.from({ length: 60 }, (_, i) => i + 1));
  const [answeredSABalls, setAnsweredSABalls] = useState<number[]>([]);
  
  // States: Timer
  const [timerInput, setTimerInput] = useState(10);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // States: Modals & UI
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [activeTFQuestionId, setActiveTFQuestionId] = useState<number | null>(null);
  const [activeSAQuestionId, setActiveSAQuestionId] = useState<number | null>(null);
  const [studentSAInput, setStudentSAInput] = useState('');
  const [answeringStudentId, setAnsweringStudentId] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- AUTH STATE ---
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');

  // --- SUPABASE SYNC ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const fetchSupabaseData = async () => {
      try {
        // Fetch classes and students
        const { data: classes } = await supabase.from('classes').select('*');
        const { data: students } = await supabase.from('students').select('*');
        
        if (classes && students) {
          const newClassesData: Record<string, Student[]> = {};
          classes.forEach(c => {
            newClassesData[c.name] = students
              .filter(s => s.class_id === c.id)
              .map(s => ({ id: s.id, name: s.name, score: s.score, class_id: s.class_id }));
          });
          if (Object.keys(newClassesData).length > 0) {
            setClassesData(newClassesData);
            if (!newClassesData[currentClass] && Object.keys(newClassesData).length > 0) {
              setCurrentClass(Object.keys(newClassesData)[0]);
            }
          }
        }

        // Fetch questions
        const { data: mcData } = await supabase.from('questions_mc').select('*').order('id');
        if (mcData && mcData.length > 0) {
            setQuestions(mcData.map(q => ({ id: q.id, text: q.text, options: q.options, correctIndex: q.correct_index })));
        }

        const { data: tfData } = await supabase.from('questions_tf').select('*').order('id');
        if (tfData && tfData.length > 0) {
            setTfQuestions(tfData.map(q => ({ id: q.id, text: q.text, isTrue: q.is_true })));
        }

        const { data: saData } = await supabase.from('questions_sa').select('*').order('id');
        if (saData && saData.length > 0) {
            setSaQuestions(saData.map(q => ({ id: q.id, text: q.text, correctAnswer: q.correct_answer })));
        }

        // Fetch game state
        const { data: gameState } = await supabase.from('game_state').select('*').eq('user_id', session.user.id).single();
        if (gameState) {
            setAnsweredBalls(gameState.answered_mc || []);
            setAnsweredTFBalls(gameState.answered_tf || []);
            setAnsweredSABalls(gameState.answered_sa || []);
        }

      } catch (error) {
        console.error("Error fetching from Supabase:", error);
      }
    };

    fetchSupabaseData();
  }, [session]);

  const syncGameState = async (mc: number[], tf: number[], sa: number[]) => {
    if (!session) return;
    await supabase.from('game_state').upsert({ user_id: session.user.id, answered_mc: mc, answered_tf: tf, answered_sa: sa }, { onConflict: 'user_id' });
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // States: Custom Alert & Confirm Modals
  const [confirmDialog, setConfirmDialog] = useState<{message: string, onConfirm: () => void} | null>(null);
  const [alertDialog, setAlertDialog] = useState('');

  // Nhạc nền (Loop)
  const bgmInterval = useRef<number | null>(null);
  const toggleBGM = () => {
    initAudio(); // Đảm bảo audio context đã chạy
    if (bgmPlaying) {
      if (bgmInterval.current) clearInterval(bgmInterval.current);
      setBgmPlaying(false);
    } else {
      setBgmPlaying(true);
      bgmInterval.current = window.setInterval(() => {
        const notes = [220, 246, 277, 329, 369]; // A ngũ cung
        const randomNote = notes[Math.floor(Math.random() * notes.length)];
        playTone(randomNote, 'sine', 2, 0.02);
      }, 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (bgmInterval.current) clearInterval(bgmInterval.current);
    };
  }, []);

  // Reset trang khi đổi lớp hoặc tìm kiếm
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, currentClass]);

  // Timer logic
  useEffect(() => {
    let interval: number | null = null;
    if (isTimerRunning && timeLeft > 0) {
      interval = window.setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      sounds.wrong(); // Báo hết giờ
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timeLeft]);

  const startTimer = () => {
    setTimeLeft(timerInput);
    setIsTimerRunning(true);
  };

  // Logic Học sinh
  const addStudent = () => {
    if (newStudentName.trim()) {
      setClassesData(prev => ({
        ...prev,
        [currentClass]: [...(prev[currentClass] || []), { id: Date.now().toString() + Math.random().toString(36).substring(2,9), name: newStudentName, score: 0 }]
      }));
      setNewStudentName('');
    }
  };

  const removeStudent = (id: string) => {
    setClassesData(prev => ({
      ...prev,
      [currentClass]: prev[currentClass].filter(s => s.id !== id)
    }));
  };

  const updateStudentScore = (id: string, points: number) => {
    setClassesData(prev => ({
      ...prev,
      [currentClass]: prev[currentClass].map(s => s.id === id ? { ...s, score: s.score + points } : s)
    }));
  };

  // Logic Import/Export Danh sách
  const handleTextFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImportText(e.target?.result as string);
      };
      reader.readAsText(file);
    }
    event.target.value = ''; // Reset
  };

  const handleImportListSubmit = () => {
    if (!importText.trim()) {
      setAlertDialog("Vui lòng dán hoặc tải lên danh sách học sinh!");
      return;
    }
    const names = importText.split('\n').map(n => n.trim()).filter(n => n !== '');
    const newStudents = names.map(name => ({ 
      id: Date.now().toString() + Math.random().toString(36).substring(2,9), 
      name, 
      score: 0 
    }));

    setClassesData(prev => ({
      ...prev,
      [currentClass]: [...(prev[currentClass] || []), ...newStudents]
    }));
    setShowImportListModal(false);
    setImportText('');
    setAlertDialog(`Đã thêm thành công ${newStudents.length} học sinh vào lớp ${currentClass}.`);
  };

  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(classesData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Data_CacLop_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
            setClassesData(json);
            const keys = Object.keys(json);
            if (keys.length > 0 && !keys.includes(currentClass)) {
              setCurrentClass(keys[0]);
            }
            setAlertDialog("Nhập dữ liệu JSON thành công!");
          } else {
            setAlertDialog("Cấu trúc file JSON không hợp lệ!");
          }
        } catch (err) {
          setAlertDialog("Lỗi đọc file JSON. Vui lòng kiểm tra lại định dạng.");
        }
        if(jsonFileInputRef.current) jsonFileInputRef.current.value = '';
      };
      reader.readAsText(file);
    }
  };

  // Logic Trò chơi
  const shuffleBalls = () => {
    let shuffled = [...balls];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setBalls(shuffled);
  };

  const shuffleTFBalls = () => {
    let shuffled = [...tfBalls];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setTfBalls(shuffled);
  };

  const shuffleSABalls = () => {
    let shuffled = [...saBalls];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setSaBalls(shuffled);
  };

  const handleBallClick = (ballId: number) => {
    initAudio(); // Init audio on first interaction
    if (!answeredBalls.includes(ballId)) {
      setActiveQuestionId(ballId);
      setAnsweringStudentId(students.length > 0 ? students[0].id : '');
    }
  };

  const handleTFBallClick = (ballId: number) => {
    initAudio();
    if (!answeredTFBalls.includes(ballId)) {
      setActiveTFQuestionId(ballId);
      setAnsweringStudentId(students.length > 0 ? students[0].id : '');
    }
  };

  const handleSABallClick = (ballId: number) => {
    initAudio();
    if (!answeredSABalls.includes(ballId)) {
      setActiveSAQuestionId(ballId);
      setAnsweringStudentId(students.length > 0 ? students[0].id : '');
      setStudentSAInput('');
    }
  };

  const submitAnswer = (optionIndex: number) => {
    const question = questions.find(q => q.id === activeQuestionId);
    if (!question) return;

    if (!answeringStudentId) {
        setAlertDialog("Vui lòng chọn học sinh trả lời!");
        return;
    }

    if (question.correctIndex === optionIndex) {
      sounds.correct();
      updateStudentScore(answeringStudentId, 10); // CỘNG 10 ĐIỂM
    } else {
      sounds.wrong();
    }
    
    setAnsweredBalls([...answeredBalls, activeQuestionId!]);
    setActiveQuestionId(null);
  };

  const submitTFAnswer = (answer: boolean) => {
    const question = tfQuestions.find(q => q.id === activeTFQuestionId);
    if (!question) return;

    if (!answeringStudentId) {
        setAlertDialog("Vui lòng chọn học sinh trả lời!");
        return;
    }

    if (question.isTrue === answer) {
      sounds.correct();
      updateStudentScore(answeringStudentId, 10); // CỘNG 10 ĐIỂM
    } else {
      sounds.wrong();
    }
    
    setAnsweredTFBalls([...answeredTFBalls, activeTFQuestionId!]);
    setActiveTFQuestionId(null);
  };

  const submitSAAnswer = () => {
    const question = saQuestions.find(q => q.id === activeSAQuestionId);
    if (!question) return;

    if (!answeringStudentId) {
        setAlertDialog("Vui lòng chọn học sinh trả lời!");
        return;
    }

    if (!studentSAInput.trim()) {
        setAlertDialog("Vui lòng nhập câu trả lời!");
        return;
    }

    const isCorrect = studentSAInput.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();

    if (isCorrect) {
      sounds.correct();
      updateStudentScore(answeringStudentId, 10); // CỘNG 10 ĐIỂM
    } else {
      sounds.wrong();
    }
    
    setAnsweredSABalls([...answeredSABalls, activeSAQuestionId!]);
    setActiveSAQuestionId(null);
  };

  const resetGame = () => {
    setConfirmDialog({
        message: "Bạn có chắc muốn làm mới lại bảng (khôi phục các câu hỏi đã trả lời)?",
        onConfirm: () => {
            setAnsweredBalls([]);
            setAnsweredTFBalls([]);
            setAnsweredSABalls([]);
            setConfirmDialog(null);
        }
    });
  };

  const resetScores = () => {
    setConfirmDialog({
        message: `Làm mới toàn bộ điểm học sinh lớp ${currentClass} về 0?`,
        onConfirm: () => {
            setClassesData(prev => ({
                ...prev,
                [currentClass]: prev[currentClass].map(s => ({...s, score: 0}))
            }));
            setConfirmDialog(null);
        }
    });
  };

  // Tính Top 3 & Phân trang
  const top3Students = [...students].sort((a, b) => b.score - a.score).slice(0, 3);
  const filteredStudents = students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPages = Math.ceil(filteredStudents.length / STUDENTS_PER_PAGE) || 1;
  const displayedStudents = filteredStudents.slice((currentPage - 1) * STUDENTS_PER_PAGE, currentPage * STUDENTS_PER_PAGE);

  const saveQuestionsToSupabase = async () => {
    if (!session) return;
    setIsSyncing(true);
    try {
      // Upsert MC questions
      const mcPayload = questions.map(q => ({ id: q.id, user_id: session.user.id, text: q.text, options: q.options, correct_index: q.correctIndex }));
      await supabase.from('questions_mc').upsert(mcPayload, { onConflict: 'id,user_id' });

      // Upsert TF questions
      const tfPayload = tfQuestions.map(q => ({ id: q.id, user_id: session.user.id, text: q.text, is_true: q.isTrue }));
      await supabase.from('questions_tf').upsert(tfPayload, { onConflict: 'id,user_id' });

      // Upsert SA questions
      const saPayload = saQuestions.map(q => ({ id: q.id, user_id: session.user.id, text: q.text, correct_answer: q.correctAnswer }));
      await supabase.from('questions_sa').upsert(saPayload, { onConflict: 'id,user_id' });

      setAlertDialog("Đã lưu toàn bộ câu hỏi lên Supabase thành công!");
    } catch (error) {
      console.error(error);
      setAlertDialog("Có lỗi xảy ra khi lưu lên Supabase!");
    }
    setIsSyncing(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMessage('');
    setAuthError('');
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        setAuthMessage('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận (nếu có) hoặc đăng nhập.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
      }
    } catch (error: any) {
      setAuthError(error.error_description || error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!session) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-gradient-to-br from-[#ebdffa] to-[#d4c4f0] text-gray-800'}`}>
        <div className={`w-full max-w-md p-8 rounded-3xl shadow-2xl border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-white'}`}>
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-purple-100 rounded-2xl flex items-center justify-center shadow-inner">
              <Lock className="text-purple-600" size={40} />
            </div>
          </div>
          <h2 className="text-3xl font-black text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
            {isSignUp ? 'Tạo Tài Khoản' : 'Đăng Nhập'}
          </h2>
          <p className="text-center text-sm mb-8 opacity-70">
            {isSignUp ? 'Đăng ký để lưu trữ dữ liệu của riêng bạn' : 'Đăng nhập để tiếp tục quản lý lớp học'}
          </p>

          <form onSubmit={handleAuth} className="space-y-5">
            {authError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl text-sm">
                {authError}
              </div>
            )}
            {authMessage && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-xl text-sm">
                {authMessage}
              </div>
            )}
            <div>
              <label className="block text-sm font-bold mb-2 opacity-80">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 opacity-50" size={20} />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl outline-none border focus:ring-2 focus:ring-purple-400 transition-all ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
                  placeholder="Nhập email của bạn"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold mb-2 opacity-80">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 opacity-50" size={20} />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl outline-none border focus:ring-2 focus:ring-purple-400 transition-all ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
                  placeholder="Nhập mật khẩu"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-70"
            >
              {authLoading ? 'Đang xử lý...' : (isSignUp ? <><UserPlus size={20}/> Đăng Ký</> : <><LogIn size={20}/> Đăng Nhập</>)}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <button onClick={() => setIsSignUp(!isSignUp)} className="text-purple-600 hover:text-purple-800 font-bold hover:underline transition-colors">
              {isSignUp ? 'Đã có tài khoản? Đăng nhập ngay' : 'Chưa có tài khoản? Đăng ký mới'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen font-sans overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-gradient-to-br from-[#ebdffa] to-[#d4c4f0] text-gray-800'}`}>
      
      {/* CỘT TRÁI: DANH SÁCH HỌC SINH */}
      <div className="w-[320px] h-full flex-shrink-0 p-4 z-10 relative flex flex-col">
        {/* Background hình bảng gỗ */}
        <div className={`flex-1 rounded-3xl border-[10px] shadow-2xl flex flex-col overflow-hidden relative transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-[#f4e6c3] border-[#c18c5d]'}`}>
          
          {/* Class Header */}
          <div className={`p-4 flex flex-col items-center border-b relative transition-colors duration-300 ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-[#fff3d4] border-[#e6d0a7]'}`}>
             <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-20 h-6 bg-red-500 rounded-b-xl flex justify-center items-center shadow-md">
                 <div className="w-12 h-1.5 bg-red-800 rounded-full opacity-50"></div>
             </div>
             
             <div className="mt-4 flex flex-col w-full gap-3">
                <div className={`flex items-center justify-between px-4 py-2 rounded-xl font-bold text-sm shadow-sm border transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 text-red-400 border-gray-600' : 'bg-white text-red-600 border-orange-200'}`}>
                  <span>LỚP:</span>
                  <select 
                    value={currentClass} 
                    onChange={(e) => setCurrentClass(e.target.value)}
                    className={`w-28 outline-none text-right bg-transparent cursor-pointer ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}
                  >
                    {Object.keys(classesData).map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Tên lớp mới..."
                    className={`flex-1 rounded-xl px-3 py-2 text-sm outline-none border shadow-inner focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300'}`}
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newClassName.trim() && !classesData[newClassName.trim()]) {
                        setClassesData(prev => ({...prev, [newClassName.trim()]: []}));
                        setCurrentClass(newClassName.trim());
                        setNewClassName('');
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      if(newClassName.trim() && !classesData[newClassName.trim()]) {
                        setClassesData(prev => ({...prev, [newClassName.trim()]: []}));
                        setCurrentClass(newClassName.trim());
                        setNewClassName('');
                      }
                    }}
                    className="bg-green-500 text-white px-3 rounded-xl text-sm font-bold shadow-md hover:bg-green-600 active:scale-95 transition-all flex items-center justify-center"
                    title="Thêm lớp mới"
                  >
                    <Plus size={18} />
                  </button>
                </div>
             </div>
          </div>

          {/* Add, Search and Import/Export */}
          <div className={`p-3 flex flex-col gap-3 border-b transition-colors duration-300 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-orange-200 bg-[#fdf8ed]'}`}>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Thêm học sinh..." 
                className={`flex-1 rounded-xl px-3 py-2 text-sm outline-none border shadow-inner focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300'}`}
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStudent()}
              />
              <button 
                onClick={addStudent}
                className="bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-blue-600 active:scale-95 transition-all"
              >
                Thêm
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setShowImportListModal(true)} className="flex flex-col items-center justify-center gap-1 bg-teal-500 text-white py-2 rounded-xl text-[10px] font-bold shadow-sm hover:bg-teal-600 hover:shadow-md transition-all active:scale-95">
                <FileText size={14} /> Nhập DS
              </button>
              <button onClick={() => jsonFileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-1 bg-indigo-500 text-white py-2 rounded-xl text-[10px] font-bold shadow-sm hover:bg-indigo-600 hover:shadow-md transition-all active:scale-95">
                <Upload size={14} /> Nhập JSON
              </button>
              <button onClick={exportJSON} className="flex flex-col items-center justify-center gap-1 bg-amber-600 text-white py-2 rounded-xl text-[10px] font-bold shadow-sm hover:bg-amber-700 hover:shadow-md transition-all active:scale-95">
                <Download size={14} /> Xuất JSON
              </button>
              <input type="file" accept=".json" className="hidden" ref={jsonFileInputRef} onChange={importJSON} />
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Tìm tên học sinh..." 
                className={`w-full rounded-xl pl-9 pr-3 py-2 text-sm outline-none border shadow-inner focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300'}`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Student List */}
          <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar">
            {displayedStudents.length === 0 ? (
               <div className="text-center text-gray-400 text-sm mt-6 flex flex-col items-center gap-2">
                 <Search size={24} className="opacity-50" />
                 Không tìm thấy học sinh
               </div>
            ) : (
              displayedStudents.map(student => (
                <div key={student.id} className={`flex justify-between items-center py-2.5 px-2 border-b group rounded-lg transition-colors ${isDarkMode ? 'border-gray-700/50 hover:bg-gray-700/50' : 'border-orange-200/50 hover:bg-orange-50/50'}`}>
                  <span className={`font-semibold truncate flex-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`} title={student.name}>
                    {student.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold px-2 py-0.5 rounded-md min-w-[2.5rem] text-center ${isDarkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-600 bg-blue-50'}`}>
                      {student.score}
                    </span>
                    <button 
                      onClick={() => removeStudent(student.id)}
                      className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600 p-1 hover:bg-red-50 rounded-md"
                      title="Xóa học sinh"
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className={`p-3 flex justify-center items-center gap-4 border-t transition-colors duration-300 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-[#fdf8ed] border-orange-200'}`}>
               <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`p-1.5 rounded-full disabled:opacity-30 transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200'}`}
               >
                  <ChevronLeft size={18} />
               </button>
               <span className={`text-sm font-bold px-3 py-1 rounded-full shadow-sm border ${isDarkMode ? 'text-gray-300 bg-gray-700 border-gray-600' : 'text-gray-600 bg-white border-gray-200'}`}>
                 {currentPage} / {totalPages}
               </span>
               <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`p-1.5 rounded-full disabled:opacity-30 transition-colors ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200'}`}
               >
                  <ChevronRight size={18} />
               </button>
            </div>
          )}
        </div>
      </div>

      {/* PHẦN GIỮA: MÀN HÌNH CHÍNH */}
      <div className="flex-1 flex flex-col p-4 relative h-full overflow-hidden">
        
        {/* Header Control */}
        <div className="flex flex-wrap justify-between items-start mb-4 pt-2 pl-4 gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center p-2 border border-gray-100">
                <img 
                  src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/1200px-React-icon.svg.png" 
                  alt="Logo" 
                  className="w-full h-full object-contain animate-[spin_10s_linear_infinite]"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-blue-600 tracking-tight drop-shadow-sm">
                GAMES LEO NÚI OLYMPIA
              </h1>
            </div>
            
            <div className={`flex flex-wrap items-center gap-3 text-sm font-medium p-2 rounded-2xl backdrop-blur-sm border shadow-sm inline-flex transition-colors duration-300 ${isDarkMode ? 'bg-gray-800/50 border-gray-700/40' : 'bg-white/50 border-white/40'}`}>
              <span className={`ml-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Thời gian (giây):</span>
              <input 
                type="number" 
                value={timerInput}
                onChange={(e) => setTimerInput(Number(e.target.value))}
                className={`w-16 px-2 py-1.5 rounded-lg outline-none text-center shadow-inner border focus:border-blue-400 focus:ring-1 focus:ring-blue-400 ${isDarkMode ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-200'}`}
                min="1"
              />
              <button 
                onClick={startTimer}
                className="bg-blue-500 text-white px-4 py-1.5 rounded-lg shadow-md hover:bg-blue-600 hover:shadow-lg active:scale-95 transition-all font-semibold"
              >
                Bắt đầu
              </button>
              {isTimerRunning && (
                  <span className="text-2xl font-black text-red-600 animate-pulse ml-2 min-w-[3rem] text-center drop-shadow-md">
                      {timeLeft}s
                  </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={resetGame} className="bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:bg-blue-600 hover:shadow-lg active:scale-95 transition-all">
                Reset câu hỏi
              </button>
              <button onClick={resetScores} className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:bg-red-600 hover:shadow-lg active:scale-95 transition-all">
                Reset Bảng Điểm
              </button>
              <button onClick={() => { shuffleBalls(); shuffleTFBalls(); shuffleSABalls(); }} className="bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:bg-green-600 hover:shadow-lg active:scale-95 transition-all flex items-center gap-2">
                <Shuffle size={16}/> Trộn Bóng
              </button>
              <button onClick={() => setShowAdmin(true)} className="bg-purple-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:bg-purple-600 hover:shadow-lg active:scale-95 transition-all flex items-center gap-2">
                <Settings size={16}/> Quản lý Câu hỏi
              </button>
              <button onClick={toggleBGM} className={`px-4 py-2 rounded-xl text-sm font-semibold shadow-md active:scale-95 transition-all flex items-center gap-2 ${bgmPlaying ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : (isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700')}`}>
                {bgmPlaying ? <Volume2 size={16}/> : <VolumeX size={16}/>} Nhạc Nền
              </button>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className={`px-4 py-2 rounded-xl text-sm font-semibold shadow-md active:scale-95 transition-all flex items-center gap-2 ${isDarkMode ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-900' : 'bg-gray-800 hover:bg-gray-700 text-white'}`}>
                {isDarkMode ? <Sun size={16}/> : <Moon size={16}/>} {isDarkMode ? 'Sáng' : 'Tối'}
              </button>
              <button onClick={handleLogout} className="bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md hover:bg-rose-600 hover:shadow-lg active:scale-95 transition-all flex items-center gap-2 ml-auto">
                <LogOut size={16}/> Đăng xuất
              </button>
            </div>
          </div>
        </div>

        {/* Bảng 60 Viên cầu */}
        <div className="flex-1 flex flex-col items-center justify-start pr-0 lg:pr-64 pb-4 overflow-y-auto custom-scrollbar">
          
          <div className={`w-full max-w-5xl mb-4 mt-2 px-4 py-2 rounded-xl shadow-sm border text-center font-bold text-lg tracking-wide ${isDarkMode ? 'bg-gray-800 border-gray-700 text-purple-400' : 'bg-white/80 border-white text-purple-800'}`}>
            BÀI TẬP 1: TRẮC NGHIỆM (60 CÂU)
          </div>

          <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 md:gap-4 max-w-5xl p-4">
            {balls.map((ballId) => {
              const isAnswered = answeredBalls.includes(ballId);
              return (
                <div 
                  key={ballId}
                  onMouseEnter={() => !isAnswered && sounds.hover()}
                  onClick={() => handleBallClick(ballId)}
                  className={`
                    relative w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center
                    cursor-pointer transition-all duration-300 border-2 shadow-md
                    ${isAnswered 
                      ? (isDarkMode ? 'bg-gray-700 border-gray-600 grayscale opacity-50 scale-95 pointer-events-none' : 'bg-gray-200 border-gray-300 grayscale opacity-50 scale-95 pointer-events-none')
                      : (isDarkMode ? 'bg-gradient-to-br from-gray-800 to-gray-700 border-gray-600 hover:scale-110 hover:shadow-xl hover:border-gray-500' : 'bg-gradient-to-br from-white to-pink-50 border-pink-300 hover:scale-110 hover:shadow-xl hover:border-pink-400')
                    }
                  `}
                >
                  {/* Ảnh Pokemon */}
                  <img 
                    src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${ballId}.png`} 
                    alt={`Pokemon ${ballId}`} 
                    className="w-8 h-8 md:w-12 md:h-12 object-contain drop-shadow-sm transition-transform duration-300 hover:rotate-12"
                    loading="lazy"
                  />
                  {/* Badge Số Câu Hỏi */}
                  <div className={`
                    absolute -top-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold text-white shadow-sm border-2 border-white
                    ${isAnswered ? 'bg-gray-500' : 'bg-red-500'}
                  `}>
                    {ballId}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`w-full max-w-5xl mt-8 mb-4 px-4 py-2 rounded-xl shadow-sm border text-center font-bold text-lg tracking-wide ${isDarkMode ? 'bg-gray-800 border-gray-700 text-teal-400' : 'bg-white/80 border-white text-teal-800'}`}>
            BÀI TẬP 2: ĐÚNG / SAI (60 CÂU)
          </div>

          <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 md:gap-4 max-w-5xl p-4 mb-8">
            {tfBalls.map((ballId) => {
              const isAnswered = answeredTFBalls.includes(ballId);
              return (
                <div 
                  key={`tf-${ballId}`}
                  onMouseEnter={() => !isAnswered && sounds.hover()}
                  onClick={() => handleTFBallClick(ballId)}
                  className={`
                    relative w-12 h-12 md:w-16 md:h-16 rounded-xl flex items-center justify-center
                    cursor-pointer transition-all duration-300 border-2 shadow-md
                    ${isAnswered 
                      ? (isDarkMode ? 'bg-gray-700 border-gray-600 grayscale opacity-50 scale-95 pointer-events-none' : 'bg-gray-200 border-gray-300 grayscale opacity-50 scale-95 pointer-events-none')
                      : (isDarkMode ? 'bg-gradient-to-br from-gray-800 to-gray-700 border-teal-700 hover:scale-110 hover:shadow-xl hover:border-teal-500' : 'bg-gradient-to-br from-white to-teal-50 border-teal-300 hover:scale-110 hover:shadow-xl hover:border-teal-400')
                    }
                  `}
                >
                  {/* Ảnh Pokemon khác cho phần Đúng/Sai */}
                  <img 
                    src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${ballId + 100}.png`} 
                    alt={`Pokemon TF ${ballId}`} 
                    className="w-8 h-8 md:w-12 md:h-12 object-contain drop-shadow-sm transition-transform duration-300 hover:rotate-12"
                    loading="lazy"
                  />
                  {/* Badge Số Câu Hỏi */}
                  <div className={`
                    absolute -top-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold text-white shadow-sm border-2 border-white
                    ${isAnswered ? 'bg-gray-500' : 'bg-teal-500'}
                  `}>
                    {ballId}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`w-full max-w-5xl mt-8 mb-4 px-4 py-2 rounded-xl shadow-sm border text-center font-bold text-lg tracking-wide ${isDarkMode ? 'bg-gray-800 border-gray-700 text-orange-400' : 'bg-white/80 border-white text-orange-800'}`}>
            BÀI TẬP 3: TRẢ LỜI NGẮN (60 CÂU)
          </div>

          <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 md:gap-4 max-w-5xl p-4 mb-8">
            {saBalls.map((ballId) => {
              const isAnswered = answeredSABalls.includes(ballId);
              return (
                <div 
                  key={`sa-${ballId}`}
                  onMouseEnter={() => !isAnswered && sounds.hover()}
                  onClick={() => handleSABallClick(ballId)}
                  className={`
                    relative w-12 h-12 md:w-16 md:h-16 rounded-lg flex items-center justify-center
                    cursor-pointer transition-all duration-300 border-2 shadow-md
                    ${isAnswered 
                      ? (isDarkMode ? 'bg-gray-700 border-gray-600 grayscale opacity-50 scale-95 pointer-events-none' : 'bg-gray-200 border-gray-300 grayscale opacity-50 scale-95 pointer-events-none')
                      : (isDarkMode ? 'bg-gradient-to-br from-gray-800 to-gray-700 border-orange-700 hover:scale-110 hover:shadow-xl hover:border-orange-500' : 'bg-gradient-to-br from-white to-orange-50 border-orange-300 hover:scale-110 hover:shadow-xl hover:border-orange-400')
                    }
                  `}
                >
                  {/* Ảnh Pokemon khác cho phần Trả lời ngắn */}
                  <img 
                    src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${ballId + 200}.png`} 
                    alt={`Pokemon SA ${ballId}`} 
                    className="w-8 h-8 md:w-12 md:h-12 object-contain drop-shadow-sm transition-transform duration-300 hover:rotate-12"
                    loading="lazy"
                  />
                  {/* Badge Số Câu Hỏi */}
                  <div className={`
                    absolute -top-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold text-white shadow-sm border-2 border-white
                    ${isAnswered ? 'bg-gray-500' : 'bg-orange-500'}
                  `}>
                    {ballId}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BẢNG XẾP HẠNG TOP 3 (Absolute Right on Large Screens, Hidden/Bottom on Small) */}
        <div className="hidden lg:block absolute top-6 right-6 w-64 bg-gradient-to-b from-[#6e3b1c] to-[#5a2e12] rounded-3xl shadow-2xl overflow-hidden border-4 border-[#8b4513] z-20 transform transition-transform hover:scale-105">
            <div className="bg-gradient-to-r from-[#ffae00] to-[#ff8c00] text-amber-900 font-black text-center py-3 flex items-center justify-center gap-2 shadow-inner">
                <Trophy size={22} className="drop-shadow-sm" /> BẢNG VÀNG TOP 3
            </div>
            <div className="flex justify-center -mt-4 relative z-10 drop-shadow-lg">
                <Star size={40} fill="#FFD700" color="#B8860B" className="transform -rotate-12" />
                <Star size={52} fill="#FFD700" color="#B8860B" className="-mt-5 mx-1 z-10" />
                <Star size={40} fill="#FFD700" color="#B8860B" className="transform rotate-12" />
            </div>
            <div className="p-5 pt-3 text-white font-medium flex flex-col gap-3">
                {top3Students.length === 0 ? (
                    <div className="text-center text-amber-200/50 text-sm py-4 italic">Chưa có dữ liệu thi đấu</div>
                ) : (
                    top3Students.map((student, idx) => (
                        <div key={student.id} className="flex justify-between items-center border-b border-[#8b4513]/50 pb-2 last:border-0">
                            <span className="truncate w-36 flex items-center gap-2">
                                <span className={`
                                  flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                                  ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-gray-300 text-gray-800' : 'bg-amber-600 text-amber-100'}
                                `}>
                                  {idx + 1}
                                </span>
                                {student.name}
                            </span>
                            <span className="text-yellow-400 font-black text-lg drop-shadow-md">{student.score}</span>
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* Footer Tác giả */}
        <div className={`absolute bottom-2 left-1/2 transform -translate-x-1/2 text-sm font-medium z-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Tác giả: Dương Thị Hiệp, Trường THCS Bình An - Kiên Lương - An Giang
        </div>
      </div>

      {/* --- MODAL NHẬP DANH SÁCH --- */}
      {showImportListModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-teal-500 to-teal-600 text-white p-5 flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2"><FileText /> Nhập Danh Sách Học Sinh</h2>
              <button onClick={() => setShowImportListModal(false)} className="hover:text-teal-200 transition-colors bg-white/10 p-1 rounded-full"><X size={24} /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4 bg-teal-50 p-3 rounded-xl border border-teal-100">
                Bạn có thể <b>Copy danh sách từ Excel, Word</b> (chỉ quét cột chứa tên học sinh) và <b>Dán</b> vào ô bên dưới, mỗi tên sẽ nằm trên 1 dòng.
              </p>
              
              <div className="mb-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Hoặc tải lên từ File (.txt, .csv):</label>
                <input type="file" accept=".txt,.csv" onChange={handleTextFileImport} className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-teal-100 file:text-teal-700 hover:file:bg-teal-200 transition-colors cursor-pointer" />
              </div>

              <textarea
                className="w-full h-48 border-2 border-gray-200 rounded-xl p-4 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 resize-none shadow-inner transition-all"
                placeholder="Ví dụ:&#10;Nguyễn Văn A&#10;Trần Thị B&#10;Lê Văn C..."
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              ></textarea>

              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowImportListModal(false)} className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 font-semibold text-gray-700 transition-colors">Hủy</button>
                <button onClick={handleImportListSubmit} className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 font-semibold text-white shadow-md hover:shadow-lg transition-all active:scale-95">Lưu vào Lớp {currentClass}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL TRẢ LỜI CÂU HỎI --- */}
      {activeQuestionId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-300 transform">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-5 flex justify-between items-center shadow-md relative z-10">
              <h2 className="text-2xl font-black tracking-wide flex items-center gap-2">
                <span className="bg-white/20 px-3 py-1 rounded-lg">Câu hỏi số {activeQuestionId}</span>
              </h2>
              <button onClick={() => setActiveQuestionId(null)} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-8 bg-gray-50/50">
              <div className="text-2xl mb-8 text-center font-bold text-gray-800 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-h-[120px] flex items-center justify-center">
                {questions.find(q => q.id === activeQuestionId)?.text}
              </div>

              <div className="mb-8 flex justify-center items-center gap-4 bg-purple-50 p-4 rounded-2xl border border-purple-100">
                  <span className="font-bold text-purple-800">Học sinh trả lời:</span>
                  <select 
                      value={answeringStudentId} 
                      onChange={(e) => setAnsweringStudentId(e.target.value)}
                      className="border-2 border-purple-300 rounded-xl p-2.5 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 font-semibold text-gray-700 min-w-[250px] bg-white shadow-sm transition-all cursor-pointer"
                  >
                      <option value="" disabled>-- Chọn học sinh --</option>
                      {students.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.score} điểm)</option>
                      ))}
                  </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {questions.find(q => q.id === activeQuestionId)?.options.map((opt, idx) => (
                  <button 
                    key={idx}
                    onClick={() => submitAnswer(idx)}
                    className="group relative p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-purple-500 hover:bg-purple-50 hover:shadow-md transition-all text-left text-lg font-medium overflow-hidden active:scale-[0.98]"
                  >
                    <div className="absolute inset-0 bg-purple-100 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 group-hover:bg-purple-200 text-gray-600 group-hover:text-purple-700 font-black mr-3 transition-colors">
                      {String.fromCharCode(65 + idx)}
                    </span> 
                    <span className="text-gray-700 group-hover:text-purple-900 transition-colors">{opt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL TRẢ LỜI CÂU HỎI ĐÚNG/SAI --- */}
      {activeTFQuestionId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-300 transform">
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white p-5 flex justify-between items-center shadow-md relative z-10">
              <h2 className="text-2xl font-black tracking-wide flex items-center gap-2">
                <span className="bg-white/20 px-3 py-1 rounded-lg">Câu hỏi Đúng/Sai số {activeTFQuestionId}</span>
              </h2>
              <button onClick={() => setActiveTFQuestionId(null)} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-8 bg-gray-50/50">
              <div className="text-2xl mb-8 text-center font-bold text-gray-800 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-h-[120px] flex items-center justify-center">
                {tfQuestions.find(q => q.id === activeTFQuestionId)?.text}
              </div>

              <div className="mb-8 flex justify-center items-center gap-4 bg-teal-50 p-4 rounded-2xl border border-teal-100">
                  <span className="font-bold text-teal-800">Học sinh trả lời:</span>
                  <select 
                      value={answeringStudentId} 
                      onChange={(e) => setAnsweringStudentId(e.target.value)}
                      className="border-2 border-teal-300 rounded-xl p-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 font-semibold text-gray-700 min-w-[250px] bg-white shadow-sm transition-all cursor-pointer"
                  >
                      <option value="" disabled>-- Chọn học sinh --</option>
                      {students.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.score} điểm)</option>
                      ))}
                  </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-lg mx-auto">
                <button 
                  onClick={() => submitTFAnswer(true)}
                  className="group relative p-6 rounded-2xl border-2 border-gray-200 bg-white hover:border-green-500 hover:bg-green-50 hover:shadow-md transition-all text-center text-xl font-bold overflow-hidden active:scale-[0.98] flex flex-col items-center gap-3"
                >
                  <div className="absolute inset-0 bg-green-100 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                  <CheckCircle size={48} className="text-gray-400 group-hover:text-green-500 transition-colors" />
                  <span className="text-gray-700 group-hover:text-green-700 transition-colors">ĐÚNG</span>
                </button>
                <button 
                  onClick={() => submitTFAnswer(false)}
                  className="group relative p-6 rounded-2xl border-2 border-gray-200 bg-white hover:border-red-500 hover:bg-red-50 hover:shadow-md transition-all text-center text-xl font-bold overflow-hidden active:scale-[0.98] flex flex-col items-center gap-3"
                >
                  <div className="absolute inset-0 bg-red-100 opacity-0 group-hover:opacity-20 transition-opacity"></div>
                  <XCircle size={48} className="text-gray-400 group-hover:text-red-500 transition-colors" />
                  <span className="text-gray-700 group-hover:text-red-700 transition-colors">SAI</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL TRẢ LỜI NGẮN --- */}
      {activeSAQuestionId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-300 transform">
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white p-5 flex justify-between items-center shadow-md relative z-10">
              <h2 className="text-2xl font-black tracking-wide flex items-center gap-2">
                <span className="bg-white/20 px-3 py-1 rounded-lg">Câu hỏi Trả lời ngắn số {activeSAQuestionId}</span>
              </h2>
              <button onClick={() => setActiveSAQuestionId(null)} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <div className="p-8 bg-gray-50/50">
              <div className="text-2xl mb-8 text-center font-bold text-gray-800 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-h-[120px] flex items-center justify-center">
                {saQuestions.find(q => q.id === activeSAQuestionId)?.text}
              </div>

              <div className="mb-8 flex justify-center items-center gap-4 bg-orange-50 p-4 rounded-2xl border border-orange-100">
                  <span className="font-bold text-orange-800">Học sinh trả lời:</span>
                  <select 
                      value={answeringStudentId} 
                      onChange={(e) => setAnsweringStudentId(e.target.value)}
                      className="border-2 border-orange-300 rounded-xl p-2.5 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 font-semibold text-gray-700 min-w-[250px] bg-white shadow-sm transition-all cursor-pointer"
                  >
                      <option value="" disabled>-- Chọn học sinh --</option>
                      {students.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.score} điểm)</option>
                      ))}
                  </select>
              </div>

              <div className="flex flex-col gap-4 max-w-lg mx-auto">
                <input
                  type="text"
                  value={studentSAInput}
                  onChange={(e) => setStudentSAInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitSAAnswer()}
                  placeholder="Nhập câu trả lời..."
                  className="w-full text-center text-xl p-4 rounded-2xl border-2 border-gray-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none transition-all shadow-inner"
                />
                <button
                  onClick={submitSAAnswer}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xl p-4 rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-95"
                >
                  XÁC NHẬN ĐÁP ÁN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL QUẢN LÝ CÂU HỎI (ADMIN) --- */}
      {showAdmin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-6">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b flex justify-between items-center bg-gradient-to-r from-gray-50 to-gray-100">
              <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                <Settings className="text-purple-600" /> Quản lý Ngân hàng Câu hỏi
              </h2>
              <div className="flex gap-3">
                <button 
                  onClick={saveQuestionsToSupabase} 
                  disabled={isSyncing}
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  <Save size={20} /> {isSyncing ? 'Đang lưu...' : 'Lưu lên Cloud'}
                </button>
                <button onClick={() => setShowAdmin(false)} className="text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-full p-2 transition-colors">
                  <X size={28} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-gray-100/50">
              <h3 className="text-xl font-bold text-purple-800 mb-4 border-b-2 border-purple-200 pb-2">Phần 1: Trắc nghiệm (60 Câu)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
                {questions.map((q, qIndex) => (
                  <div key={q.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="font-black text-lg mb-3 text-purple-700 flex items-center gap-2 border-b pb-2">
                      <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md text-sm">#{q.id}</span>
                      Viên cầu số {q.id}
                    </div>
                    <textarea 
                      className="w-full border border-gray-300 rounded-xl p-3 text-sm mb-4 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 resize-none transition-all"
                      rows={3}
                      value={q.text}
                      onChange={(e) => {
                        const newQ = [...questions];
                        newQ[qIndex].text = e.target.value;
                        setQuestions(newQ);
                      }}
                      placeholder="Nhập nội dung câu hỏi..."
                    />
                    <div className="space-y-2">
                      {q.options.map((opt, optIndex) => (
                         <div key={optIndex} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${q.correctIndex === optIndex ? 'bg-green-50 border-green-200' : 'border-transparent hover:bg-gray-50'}`}>
                            <input 
                              type="radio" 
                              name={`correct-${q.id}`} 
                              checked={q.correctIndex === optIndex}
                              onChange={() => {
                                const newQ = [...questions];
                                newQ[qIndex].correctIndex = optIndex;
                                setQuestions(newQ);
                              }}
                              className="w-5 h-5 cursor-pointer text-green-600 focus:ring-green-500"
                              title="Đánh dấu là đáp án đúng"
                            />
                            <span className="font-bold text-gray-500 w-6">{String.fromCharCode(65 + optIndex)}.</span>
                            <input 
                              type="text" 
                              value={opt}
                              onChange={(e) => {
                                const newQ = [...questions];
                                newQ[qIndex].options[optIndex] = e.target.value;
                                setQuestions(newQ);
                              }}
                              className={`flex-1 bg-transparent border-b border-gray-200 p-1 text-sm outline-none focus:border-purple-500 transition-colors ${q.correctIndex === optIndex ? 'font-semibold text-green-800' : 'text-gray-700'}`}
                              placeholder={`Nhập đáp án ${String.fromCharCode(65 + optIndex)}`}
                            />
                         </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="text-xl font-bold text-teal-800 mb-4 border-b-2 border-teal-200 pb-2">Phần 2: Đúng / Sai (60 Câu)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
                {tfQuestions.map((q, qIndex) => (
                  <div key={`tf-admin-${q.id}`} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="font-black text-lg mb-3 text-teal-700 flex items-center gap-2 border-b pb-2">
                      <span className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-md text-sm">#{q.id}</span>
                      Câu hỏi Đúng/Sai số {q.id}
                    </div>
                    <textarea 
                      className="w-full border border-gray-300 rounded-xl p-3 text-sm mb-4 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 resize-none transition-all"
                      rows={3}
                      value={q.text}
                      onChange={(e) => {
                        const newQ = [...tfQuestions];
                        newQ[qIndex].text = e.target.value;
                        setTfQuestions(newQ);
                      }}
                      placeholder="Nhập nội dung mệnh đề..."
                    />
                    <div className="flex gap-4">
                      <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${q.isTrue ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}>
                        <input 
                          type="radio" 
                          name={`tf-correct-${q.id}`} 
                          checked={q.isTrue === true}
                          onChange={() => {
                            const newQ = [...tfQuestions];
                            newQ[qIndex].isTrue = true;
                            setTfQuestions(newQ);
                          }}
                          className="hidden"
                        />
                        <CheckCircle size={20} /> ĐÚNG
                      </label>
                      <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${!q.isTrue ? 'bg-red-50 border-red-500 text-red-700' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}>
                        <input 
                          type="radio" 
                          name={`tf-correct-${q.id}`} 
                          checked={q.isTrue === false}
                          onChange={() => {
                            const newQ = [...tfQuestions];
                            newQ[qIndex].isTrue = false;
                            setTfQuestions(newQ);
                          }}
                          className="hidden"
                        />
                        <XCircle size={20} /> SAI
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="text-xl font-bold text-orange-800 mb-4 border-b-2 border-orange-200 pb-2">Phần 3: Trả lời ngắn (60 Câu)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {saQuestions.map((q, qIndex) => (
                  <div key={`sa-admin-${q.id}`} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="font-black text-lg mb-3 text-orange-700 flex items-center gap-2 border-b pb-2">
                      <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded-md text-sm">#{q.id}</span>
                      Câu hỏi Trả lời ngắn số {q.id}
                    </div>
                    <textarea 
                      className="w-full border border-gray-300 rounded-xl p-3 text-sm mb-4 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none transition-all"
                      rows={3}
                      value={q.text}
                      onChange={(e) => {
                        const newQ = [...saQuestions];
                        newQ[qIndex].text = e.target.value;
                        setSaQuestions(newQ);
                      }}
                      placeholder="Nhập nội dung câu hỏi..."
                    />
                    <div className="flex items-center gap-3 p-2 rounded-lg border border-orange-200 bg-orange-50">
                      <span className="font-bold text-orange-700 whitespace-nowrap">Đáp án:</span>
                      <input 
                        type="text" 
                        value={q.correctAnswer}
                        onChange={(e) => {
                          const newQ = [...saQuestions];
                          newQ[qIndex].correctAnswer = e.target.value;
                          setSaQuestions(newQ);
                        }}
                        className="flex-1 bg-white border border-gray-300 rounded-lg p-2 text-sm outline-none focus:border-orange-500 transition-colors text-gray-800 font-semibold"
                        placeholder="Nhập đáp án đúng"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM DIALOG --- */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Settings size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2 text-gray-800">Xác nhận</h3>
            <p className="text-gray-600 mb-8">{confirmDialog.message}</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 font-semibold text-gray-700 transition-colors">Hủy</button>
              <button onClick={confirmDialog.onConfirm} className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 font-semibold text-white shadow-md transition-colors">Đồng ý</button>
            </div>
          </div>
        </div>
      )}

      {/* --- ALERT DIALOG --- */}
      {alertDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center animate-in fade-in zoom-in duration-200">
             <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2 text-gray-800">Thông báo</h3>
            <p className="text-gray-600 mb-8">{alertDialog}</p>
            <div className="flex justify-center">
              <button onClick={() => setAlertDialog('')} className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 font-semibold text-white shadow-md transition-colors">Đã hiểu</button>
            </div>
          </div>
        </div>
      )}

      {/* Styles phụ trợ */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(0,0,0,0.15);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0,0,0,0.25);
        }
      `}} />
    </div>
  );
}
