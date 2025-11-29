import { useState, useEffect, useRef } from 'react';
import { Play, Square, RotateCcw, Activity, ShieldCheck, History, Smartphone, AlertTriangle } from 'lucide-react';

/**
 * 倒立機智慧監控 App (Inversion Table Smart Monitor)
 * * 整合指南:
 * 1. 確保已安裝 lucide-react: npm install lucide-react
 * 2. 確保專案已配置 Tailwind CSS
 * 3. 部署時必須使用 HTTPS，否則手機瀏覽器會封鎖陀螺儀權限
 */

interface Session {
  id: number;
  date: string;
  duration: number;
  maxAngle: number;
}

function App() {
  // --- State ---
  const [angle, setAngle] = useState<number>(0);
  const [rawBeta, setRawBeta] = useState<number>(0); // 用於校正邏輯
  const [calibratedZero, setCalibratedZero] = useState<number>(90); // 預設假設：手機垂直拿著 = 90度
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [timer, setTimer] = useState<number>(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [historyGraphData, setHistoryGraphData] = useState<number[]>(Array(30).fill(0)); // 圖表用數據 (最近30秒)
  const [maxAngleSession, setMaxAngleSession] = useState<number>(0);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);

  // --- Refs ---
  const timerRef = useRef<number | null>(null);
  const graphTimerRef = useRef<number | null>(null);

  // --- Helpers ---
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Sensors Logic ---
  const handleOrientation = (event: DeviceOrientationEvent) => {
    // Beta 通常是前後傾斜 (-180 到 180)
    // 手機直立面對自己時，beta 約為 90
    // 手機平放桌上時，beta 約為 0
    // 手機倒立時，beta 約為 -90
    let beta = event.beta || 0;

    setRawBeta(beta);

    // 計算倒立角度 (基於校正值)
    // 邏輯: 如果 calibratedZero 是 90 (直立), 當前也是 90, 則角度為 0 (未倒立)
    // 如果當前是 -90 (倒立), 則角度為 180
    // 公式: (CalibratedZero - CurrentBeta)
    let calculatedAngle = calibratedZero - beta;

    // 限制範圍在 0 到 180 之間
    if (calculatedAngle < 0) calculatedAngle = 0;
    if (calculatedAngle > 180) calculatedAngle = 180;

    setAngle(Math.round(calculatedAngle));

    // 記錄本次最大角度
    if (isRecording) {
      if (calculatedAngle > maxAngleSession) {
        setMaxAngleSession(Math.round(calculatedAngle));
      }
    }
  };

  const requestPermission = async () => {
    // iOS 13+ 需要明確請求權限
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') {
          setPermissionGranted(true);
          window.addEventListener('deviceorientation', handleOrientation);
        } else {
          alert('需要感測器權限才能測量角度。');
        }
      } catch (e) {
        console.error(e);
        // 如果是在非 HTTPS 環境或開發模式，可能無法請求，這裡做個 fallback
        setPermissionGranted(true);
      }
    } else {
      // Android 或舊版 iOS 通常不需要 requestPermission
      setPermissionGranted(true);
      window.addEventListener('deviceorientation', handleOrientation);
    }
  };

  const calibrate = () => {
    // 將當前的 beta 設為 "0度" (起始點)
    setCalibratedZero(rawBeta);
    setAngle(0);
  };

  // --- Effects ---
  useEffect(() => {
    // 偵測螢幕方向
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    window.addEventListener('resize', checkOrientation);
    checkOrientation();

    // 嘗試在載入時自動連線 (針對非 iOS 13+ 裝置)
    if (window.DeviceOrientationEvent && typeof (DeviceOrientationEvent as any).requestPermission !== 'function') {
      window.addEventListener('deviceorientation', handleOrientation);
      setPermissionGranted(true);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('resize', checkOrientation);
      if (timerRef.current) clearInterval(timerRef.current);
      if (graphTimerRef.current) clearInterval(graphTimerRef.current);
    };
  }, []);

  // 計時器邏輯
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setTimer((t) => t + 1);
      }, 1000);

      // 圖表更新 (每 0.5 秒)
      graphTimerRef.current = setInterval(() => {
        setHistoryGraphData(prev => {
          const newData = [...prev.slice(1), angle];
          return newData;
        });
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (graphTimerRef.current) clearInterval(graphTimerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (graphTimerRef.current) clearInterval(graphTimerRef.current);
    };
  }, [isRecording, angle]);

  // --- Handlers ---
  const toggleRecord = () => {
    if (isRecording) {
      // 停止並儲存
      const newSession = {
        id: Date.now(),
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: timer,
        maxAngle: maxAngleSession,
      };
      setSessions([newSession, ...sessions]);
      setIsRecording(false);
      setTimer(0);
      setMaxAngleSession(0);
    } else {
      // 開始
      setIsRecording(true);
      setTimer(0);
      setMaxAngleSession(0);
      setHistoryGraphData(Array(30).fill(0)); // 重置圖表
    }
  };

  // --- Sub-Components (內嵌以保持單檔結構) ---

  // 1. 儀表板組件
  const Gauge = ({ value, size = 300 }: { value: number; size?: number }) => {
    const radius = size * 0.4;
    const stroke = size * 0.08;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (value / 180) * (circumference / 2); // 只有 180 度 (半圓)

    let colorClass = "stroke-cyan-400";
    if (value > 150) {
      colorClass = "stroke-orange-500";
    }

    return (
      <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size / 1.8 }}>
        {/* 光暈背景 */}
        <div className={`absolute inset-0 rounded-full opacity-20 blur-xl bg-cyan-500 ${value > 150 ? 'bg-orange-500' : ''}`}></div>

        <svg height={size} width={size} className="rotate-[180deg] overflow-visible">
          {/* 軌道 */}
          <circle
            className="stroke-gray-800"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="transparent"
            r={normalizedRadius}
            cx={size / 2}
            cy={size / 2}
            strokeDasharray={`${circumference / 2} ${circumference}`}
          />
          {/* 進度條 */}
          <circle
            className={`${colorClass} transition-all duration-300 ease-out drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]`}
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset }}
            strokeLinecap="round"
            fill="transparent"
            r={normalizedRadius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>

        {/* 指針 (純 CSS 旋轉) */}
        <div
          className="absolute top-[50%] left-[50%] w-1 h-[45%] origin-bottom bg-transparent"
          style={{
            transform: `translateX(-50%) translateY(-100%) rotate(${value - 90}deg)`,
            transition: 'transform 0.3s ease-out'
          }}
        >
          <div className={`w-full h-4 rounded-full absolute top-0 ${value > 150 ? 'bg-orange-500' : 'bg-cyan-400'} shadow-[0_0_15px_currentColor]`}></div>
        </div>

        {/* 中心文字 */}
        <div className="absolute top-[30%] text-center">
          <div className={`text-6xl font-bold tracking-tighter ${value > 150 ? 'text-orange-500' : 'text-cyan-400'} drop-shadow-lg`}>
            {value}°
          </div>
          <div className="text-gray-400 text-sm mt-1 uppercase tracking-widest">目前角度</div>
          {value > 160 && <div className="text-orange-500 text-xs font-bold mt-2 animate-pulse flex items-center justify-center gap-1"><AlertTriangle size={12} /> 倒立警告</div>}
        </div>

        {/* 刻度標籤 */}
        <div className="absolute bottom-4 left-8 text-gray-500 text-xs font-mono">0°</div>
        <div className="absolute bottom-4 right-8 text-gray-500 text-xs font-mono">180°</div>
      </div>
    );
  };

  // 2. 迷你圖表組件
  const MiniChart = ({ data }: { data: number[] }) => {
    const width = 300;
    const height = 150;
    const maxVal = 180;

    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - (val / maxVal) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="w-full h-full bg-gray-900/50 rounded-xl border border-gray-800 p-4 relative overflow-hidden backdrop-blur-sm">
        <h3 className="text-gray-400 text-xs mb-2 flex items-center gap-2"><Activity size={12} /> 即時趨勢 (30s)</h3>
        {/* 網格線 */}
        <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 pointer-events-none opacity-20">
          {[...Array(24)].map((_, i) => <div key={i} className="border-r border-b border-gray-600"></div>)}
        </div>

        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="relative z-10 overflow-visible">
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`M 0,${height} ${points} V ${height} H 0 Z`} fill="url(#lineGradient)" />
          <path d={`M ${points}`} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
        </svg>
      </div>
    );
  };

  // 3. 人體姿態模擬組件
  const Visualizer = ({ angle }: { angle: number }) => {
    return (
      <div className="w-full h-full bg-gray-800/30 rounded-xl border border-gray-700 p-4 flex flex-col items-center justify-center relative overflow-hidden">
        <h3 className="absolute top-4 left-4 text-gray-400 text-xs">裝置狀態</h3>

        <div className="relative w-32 h-32 mt-4">
          {/* 底座 */}
          <div className="absolute bottom-0 w-full h-2 bg-gray-600 rounded-full"></div>
          <div className="absolute bottom-2 left-[50%] w-4 h-16 bg-gray-700 -translate-x-[50%]"></div>
          <div className="absolute bottom-10 left-[50%] w-3 h-3 bg-gray-500 rounded-full -translate-x-[50%] z-20 border-2 border-gray-800"></div>

          {/* 旋轉背板/人體 */}
          <div
            className="absolute bottom-10 left-[50%] w-2 h-24 bg-blue-500 origin-bottom rounded transition-transform duration-300 ease-linear shadow-[0_0_15px_rgba(59,130,246,0.5)]"
            style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
          >
            <div className="w-6 h-6 bg-blue-400 rounded-full absolute -top-6 left-[50%] -translate-x-[50%]"></div>
            <div className="w-8 h-20 bg-blue-900/50 absolute top-0 left-[50%] -translate-x-[50%] border border-blue-500 rounded-lg"></div>
            <div className="w-1 h-4 bg-gray-400 absolute bottom-0 -left-2"></div>
          </div>

          {/* 角度指示虛線 */}
          <svg className="absolute inset-0 pointer-events-none" style={{ transform: 'scale(1.5)' }}>
            <path d="M 64,64 L 100,64 A 36,36 0 0,0 64,28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="2 2" />
          </svg>
        </div>

        <div className="mt-6 bg-gray-800 rounded px-3 py-1 text-blue-300 text-sm font-mono border border-gray-700">
          當前傾斜: {angle}°
        </div>
      </div>
    )
  }

  // --- Main Render ---
  return (
    <div className="min-h-screen w-full bg-[#121214] text-white font-sans selection:bg-cyan-500/30 overflow-hidden flex flex-col">

      {/* 頂部導覽列 */}
      <header className="p-4 flex justify-between items-center bg-[#1a1b1e]/80 backdrop-blur-md border-b border-gray-800 z-50 sticky top-0 w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/50">
            <RotateCcw className="text-white" size={18} />
          </div>
          <h1 className="font-bold text-lg tracking-wide text-gray-100">Invert<span className="text-cyan-400">Pro</span></h1>
        </div>

        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-gray-800/50 px-3 py-1 rounded-full border border-gray-700/50">
            <div className={`w-2 h-2 rounded-full ${permissionGranted ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500'}`}></div>
            <span className="text-xs text-gray-400 font-medium">{permissionGranted ? '已連線' : '未偵測'}</span>
          </div>
        </div>
      </header>

      {/* 權限請求遮罩 (iOS 13+ 需要) */}
      {!permissionGranted && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-gray-800 p-6 rounded-2xl max-w-sm w-full text-center border border-gray-700 shadow-2xl">
            <Smartphone className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">啟用傳感器</h2>
            <p className="text-gray-400 mb-6 text-sm">此應用需要訪問您的手機陀螺儀以測量倒立角度。請確保手機已固定在倒立機上。</p>
            <button
              onClick={requestPermission}
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition-all active:scale-95 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
            >
              開啟偵測模式
            </button>
            <p className="mt-4 text-xs text-gray-500">
              若無反應，請確認您使用 HTTPS 連線或 Safari 瀏覽器。
            </p>
          </div>
        </div>
      )}

      {/* 主內容區域 */}
      <main className="flex-1 w-full overflow-y-auto overflow-x-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.1),transparent_50%)] pointer-events-none"></div>

        {isLandscape ? (
          // --- 橫向模式 (LANDSCAPE) ---
          <div className="h-full p-4 grid grid-cols-3 gap-4 max-w-6xl mx-auto items-center content-center">

            {/* 左側: 可視化人體 */}
            <div className="h-64 md:h-80">
              <Visualizer angle={angle} />
            </div>

            {/* 中間: 儀表與控制 */}
            <div className="flex flex-col items-center justify-center">
              <Gauge value={angle} size={280} />

              <div className="mt-6 text-center">
                <div className="text-5xl font-mono font-bold tracking-widest text-white drop-shadow-md tabular-nums">
                  {formatTime(timer)}
                </div>
                <div className="flex gap-2 justify-center mt-2">
                  <span className="text-xs text-cyan-500 font-bold bg-cyan-950/50 px-2 py-1 rounded border border-cyan-900">本次療程進度</span>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                {!isRecording ? (
                  <button onClick={toggleRecord} className="flex items-center gap-2 px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-full transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)]">
                    <Play size={20} fill="black" /> 開始
                  </button>
                ) : (
                  <button onClick={toggleRecord} className="flex items-center gap-2 px-8 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-full transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                    <Square size={20} fill="white" /> 結束
                  </button>
                )}
                <button onClick={calibrate} className="p-3 bg-gray-800 text-gray-400 rounded-full hover:bg-gray-700 hover:text-white border border-gray-700" title="歸零校正">
                  <RotateCcw size={20} />
                </button>
              </div>
            </div>

            {/* 右側: 圖表與數據 */}
            <div className="h-64 md:h-80 flex flex-col gap-4">
              <div className="flex-1">
                <MiniChart data={historyGraphData} />
              </div>
              <div className="h-1/3 grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-col justify-center items-center">
                  <span className="text-gray-500 text-xs uppercase">最大角度</span>
                  <span className="text-xl font-bold text-white">{maxAngleSession}°</span>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex flex-col justify-center items-center">
                  <span className="text-gray-500 text-xs uppercase">安全狀態</span>
                  <span className="text-xl font-bold text-green-400 flex items-center gap-1"><ShieldCheck size={16} /> 安全</span>
                </div>
              </div>
            </div>

          </div>
        ) : (
          // --- 直向模式 (PORTRAIT) ---
          <div className="flex flex-col items-center pt-8 pb-20 px-6 max-w-md mx-auto min-h-full">

            <div className="w-full flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-200">倒立監控</h2>
              <button onClick={calibrate} className="text-xs bg-gray-800 px-3 py-1 rounded-full text-gray-400 border border-gray-700 hover:border-cyan-500 hover:text-cyan-400 transition-colors">
                設定當前為 0°
              </button>
            </div>

            {/* 主儀表板 */}
            <div className="mb-10 scale-110">
              <Gauge value={angle} size={280} />
            </div>

            {/* 計時卡片 */}
            <div className="w-full bg-[#1a1b1e] rounded-3xl p-6 border border-gray-800 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50"></div>

              <div className="text-center mb-6">
                <div className="text-6xl font-mono font-bold text-white tracking-wider tabular-nums drop-shadow-lg">
                  {formatTime(timer)}
                </div>
                {isRecording && (
                  <div className="w-full h-1 bg-gray-800 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-cyan-500 animate-progress-indeterminate"></div>
                  </div>
                )}
              </div>

              {/* 控制按鈕區 */}
              <div className="flex justify-between items-center gap-4">
                <div className="flex flex-col items-center gap-1 text-gray-500 text-xs">
                  <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                    <ShieldCheck size={20} />
                  </div>
                  已連線
                </div>

                <button
                  onClick={toggleRecord}
                  className={`flex-1 py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${isRecording
                    ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white'
                    : 'bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-[0_0_25px_rgba(34,211,238,0.5)]'
                    }`}
                >
                  {isRecording ? '結束訓練' : '開始倒立'}
                </button>

                <div className="flex flex-col items-center gap-1 text-gray-500 text-xs">
                  <div className={`w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 ${isRecording ? 'text-green-400 animate-pulse' : 'text-gray-600'}`}>
                    <Activity size={20} />
                  </div>
                  {isRecording ? '活動中' : '待機'}
                </div>
              </div>
            </div>

            {/* 歷史記錄列表 */}
            <div className="w-full mt-8">
              <div className="flex items-center gap-2 text-gray-400 mb-4 px-2">
                <History size={16} />
                <span className="text-sm font-bold uppercase tracking-wider">最近記錄</span>
              </div>

              <div className="space-y-3">
                {sessions.length === 0 ? (
                  <div className="text-center text-gray-600 py-8 text-sm italic">
                    尚無記錄，開始您的第一次倒立吧！
                  </div>
                ) : (
                  sessions.map(session => (
                    <div key={session.id} className="bg-gray-800/40 border border-gray-700/50 p-4 rounded-xl flex justify-between items-center hover:bg-gray-800 transition-colors">
                      <div>
                        <div className="text-white font-mono text-lg">{formatTime(session.duration)}</div>
                        <div className="text-gray-500 text-xs">{session.date}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-cyan-400 font-bold text-xl">{session.maxAngle}°</div>
                        <div className="text-gray-500 text-xs uppercase">最大角度</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}
      </main>

      {/* 必要的 CSS 動畫 */}
      <style>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%) scaleX(0.2); }
          50% { transform: translateX(0%) scaleX(0.5); }
          100% { transform: translateX(100%) scaleX(0.2); }
        }
        .animate-progress-indeterminate {
          animation: progress-indeterminate 2s infinite linear;
        }
      `}</style>
    </div>
  );
}

export default App;