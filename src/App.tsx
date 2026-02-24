/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';

type GameState = 'START' | 'PLAYING' | 'OVER' | 'WIN';

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  type?: string;
}

interface Enemy {
  x: number;
  y: number;
  w: number;
  h: number;
  startX: number;
  endX: number;
  vx: number;
  dir: number;
  dead?: boolean;
  isHeavy?: boolean;
}

interface Coin {
  x: number;
  y: number;
}

interface Spike {
  x: number;
  y: number;
  w: number;
  h: number;
  isTop: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  active: boolean;
}

interface Checkpoint {
  x: number;
  y: number;
  reached: boolean;
}

interface Star {
  x: number;
  y: number;
  s: number;
  p: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicIntervalRef = useRef<number | null>(null);
  const spriteImgRef = useRef<HTMLImageElement | null>(null);
  
  const [gameState, setGameState] = useState<GameState>('START');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  
  const playerRef = useRef({
    x: 100, y: 300, w: 26, h: 36, vx: 0, vy: 0,
    speed: 5.5, gravity: 0.5, jumpPower: -11,
    jumps: 0, maxJumps: 2, facing: 1, invul: 0, zigDir: 1,
    isSpecialActive: false, hasSuperPower: false, superPowerTimer: 0
  });

  const gameDataRef = useRef({
    platforms: [] as Platform[],
    enemies: [] as Enemy[],
    coins: [] as Coin[],
    spikes: [] as Spike[],
    powerUps: [] as PowerUp[],
    checkpoints: [] as Checkpoint[],
    stars: [] as Star[],
    portal: null as { x: number, y: number, w: number, h: number } | null,
    cameraX: 0,
    goalX: 0,
    lastCheckpoint: { x: 100, y: 300 } as { x: number, y: number },
    keys: { left: false, right: false, up: false }
  });

  // Audio System
  const playTone = (freq: number, type: OscillatorType, duration: number, vol = 0.05) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };

  const playJump = () => {
    playTone(300, 'square', 0.1, 0.03);
    setTimeout(() => playTone(450, 'square', 0.15, 0.03), 50);
  };

  const playCoin = () => {
    playTone(800, 'sine', 0.1, 0.05);
    setTimeout(() => playTone(1200, 'sine', 0.2, 0.05), 80);
  };

  const playDie = () => {
    playTone(200, 'sawtooth', 0.2, 0.08);
    setTimeout(() => playTone(150, 'sawtooth', 0.3, 0.08), 150);
    setTimeout(() => playTone(100, 'sawtooth', 0.4, 0.08), 300);
  };

  const playWinMusic = () => {
    const notes = [440, 554, 659, 880];
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 'square', 0.2, 0.05), i * 150);
    });
    setTimeout(() => playTone(880, 'square', 0.6, 0.05), notes.length * 150);
  };

  const startBgMusic = () => {
    if (musicIntervalRef.current) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    
    let step = 0;
    const tempo = 150; // ms per beat
    const scale = [220, 261.63, 329.63, 392, 440]; // A minor pentatonic
    
    musicIntervalRef.current = window.setInterval(() => {
      if (gameState !== 'PLAYING') return;
      
      // Bass
      if (step % 4 === 0) {
        playTone(55, 'sawtooth', 0.4, 0.02);
      }
      
      // Arpeggio
      const note = scale[step % scale.length];
      playTone(note, 'sine', 0.2, 0.015);
      
      // High accent
      if (step % 8 === 7) {
        playTone(880, 'square', 0.1, 0.01);
      }
      
      step++;
    }, tempo);
  };

  const stopBgMusic = () => {
    if (musicIntervalRef.current) {
      clearInterval(musicIntervalRef.current);
      musicIntervalRef.current = null;
    }
  };

  const initLevel = (lv: number) => {
    const data = gameDataRef.current;
    data.platforms = [];
    data.enemies = [];
    data.coins = [];
    data.spikes = [];
    data.powerUps = [];
    data.checkpoints = [];
    data.portal = null;
    data.cameraX = 0;
    data.lastCheckpoint = { x: 100, y: 300 };
    
    const player = playerRef.current;
    player.x = 100;
    player.y = 300;
    player.vx = 0;
    player.vy = 0;
    player.zigDir = 1;
    player.jumps = 0;
    player.isSpecialActive = false;
    player.hasSuperPower = false;
    player.superPowerTimer = 0;
    
    // Start zone
    data.platforms.push({ x: 0, y: 380, w: 400, h: 100, type: 'start' });
    
    let curX = 400;
    if (lv === 5) {
      // Level 5: Normal player, heavy enemies, powerups
      for (let i = 0; i < 15; i++) {
        let gap = 150 + Math.random() * 100;
        let w = 250 + Math.random() * 200;
        let y = 280 + Math.random() * 100;
        curX += gap;
        data.platforms.push({ x: curX, y: y, w: w, h: 500 });
        
        if (i > 0 && Math.random() > 0.3) {
          // Heavy enemy
          data.enemies.push({
            x: curX + 50, y: y - 50, w: 40, h: 50,
            startX: curX + 10, endX: curX + w - 50,
            vx: 2 + Math.random() * 2, dir: 1, isHeavy: true
          });
        }
        
        if (i > 0 && i % 3 === 0) {
          // PowerUp
          data.powerUps.push({ x: curX + w / 2, y: y - 80, active: true });
        }
        
        data.coins.push({ x: curX + w / 2, y: y - 45 });
        
        if (i > 0 && i % 4 === 0) {
          data.checkpoints.push({ x: curX + 50, y: y - 60, reached: false });
        }
        
        curX += w;
      }
    } else if (lv === 4 || lv === 3) {
      // Portal to activate special mode
      data.portal = { x: 350, y: 300, w: 40, h: 80 };
      
      const levelLength = lv === 4 ? 6000 : 5000;
      // Spikes at top and bottom for both 3 and 4, starting after the start platform
      for (let x = 400; x < levelLength; x += 40) {
        data.spikes.push({ x, y: 0, w: 40, h: 30, isTop: true });
        data.spikes.push({ x, y: 420, w: 40, h: 30, isTop: false });
      }

      if (lv === 4) {
        // Level 4: Zig-Zag Level with middle spikes
        for (let i = 0; i < 20; i++) {
          let w = 300;
          let midY = 150 + Math.random() * 150;
          let gap = 140; // Increased gap for easier gameplay
          data.platforms.push({ x: curX, y: 0, w: w, h: midY - gap });
          data.platforms.push({ x: curX, y: midY + gap, w: w, h: 450 });
          data.coins.push({ x: curX + 150, y: midY });

          if (i > 0 && i % 5 === 0) {
            data.checkpoints.push({ x: curX + 150, y: midY + 30, reached: false });
          }
          curX += w;
        }
      } else {
        // Level 3: Rocket Level with middle spikes
        for (let i = 0; i < 15; i++) {
          let obsX = 600 + i * 350;
          let obsY = 100 + Math.random() * 200;
          let obsW = 40;
          let obsH = 100;
          data.platforms.push({ x: obsX, y: obsY, w: obsW, h: obsH });
          data.coins.push({ x: obsX + 100, y: obsY + 50 });
          
          // Middle spikes for difficulty
          data.spikes.push({ x: obsX + 150, y: obsY - 50 + Math.random() * 100, w: 40, h: 40, isTop: Math.random() > 0.5 });

          if (i > 0 && i % 4 === 0) {
            data.checkpoints.push({ x: obsX + 150, y: 200, reached: false });
          }
        }
        curX = levelLength;
      }
    } else {
      // Level 1 and 2
      for (let i = 0; i < 12; i++) {
        let gap = lv === 2 ? 150 + Math.random() * 120 : 120 + Math.random() * 100;
        let w = lv === 2 ? 150 + Math.random() * 150 : 200 + Math.random() * 200;
        let y = 280 + Math.random() * 100;
        curX += gap;
        data.platforms.push({ x: curX, y: y, w: w, h: 500 });
        
        if (i > 1 && Math.random() > 0.4) {
          data.enemies.push({
            x: curX + 20, y: y - 35, w: 30, h: 30,
            startX: curX + 10, endX: curX + w - 40,
            vx: lv === 2 ? 3.5 + (lv * 0.8) : 1.5 + (lv * 0.5), dir: 1
          });
        }
        data.coins.push({ x: curX + w / 2, y: y - 45 });
        
        if (i > 0 && i % 4 === 0) {
          data.checkpoints.push({ x: curX + 50, y: y - 60, reached: false });
        }
        
        curX += w;
      }
    }
    data.goalX = curX + 100;
  };

  const handleInput = () => {
    if (gameState !== 'PLAYING') return;
    const player = playerRef.current;
    if (currentLevel === 4 && player.isSpecialActive) {
      player.zigDir *= -1;
      playJump();
    } else if (currentLevel === 3 && player.isSpecialActive) {
      player.vy = -7; // Rocket boost
      playJump();
    } else if (player.jumps < player.maxJumps) {
      player.vy = player.jumpPower;
      player.jumps++;
      playJump();
    }
  };

  const triggerDie = () => {
    const player = playerRef.current;
    if (player.invul > 0) return;
    
    setLives(prev => {
      const newLives = prev - 1;
      playDie();
      if (newLives <= 0) {
        setGameState('OVER');
      } else {
        const data = gameDataRef.current;
        player.x = data.lastCheckpoint.x;
        player.y = data.lastCheckpoint.y;
        player.vy = 0;
        player.invul = 90;
      }
      return newLives;
    });
  };

  const triggerWin = () => {
    setGameState('WIN');
    playWinMusic();
  };

  useEffect(() => {
    // Load images
    const spriteImg = new Image();
    spriteImg.src = '/sprite.png';
    spriteImgRef.current = spriteImg;

    // Init stars and first level only once
    if (gameDataRef.current.stars.length === 0) {
      const stars: Star[] = [];
      for (let i = 0; i < 100; i++) {
        stars.push({
          x: Math.random() * 2000,
          y: Math.random() * 450,
          s: Math.random() * 2,
          p: Math.random() * 0.5 + 0.1
        });
      }
      gameDataRef.current.stars = stars;
      initLevel(1);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const data = gameDataRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') data.keys.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') data.keys.right = true;
      if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') {
        if (!data.keys.up) handleInput();
        data.keys.up = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const data = gameDataRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') data.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') data.keys.right = false;
      if (e.code === 'ArrowUp' || e.code === 'Space' || e.code === 'KeyW') data.keys.up = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let animationFrameId: number;
    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const data = gameDataRef.current;
      const player = playerRef.current;

      if (gameState === 'PLAYING') {
        if (currentLevel === 4 && player.isSpecialActive) {
          player.vx = player.speed * 0.8;
          player.vy = player.zigDir * player.speed;
        } else if (currentLevel === 3 && player.isSpecialActive) {
          player.vx = player.speed * 0.7;
          player.vy += 0.35; // Rocket gravity
        } else {
          if (data.keys.left) { player.vx = -player.speed; player.facing = -1; }
          else if (data.keys.right) { player.vx = player.speed; player.facing = 1; }
          else player.vx *= 0.85;
          player.vy += player.gravity;
        }

        let nextX = player.x + player.vx;
        let nextY = player.y + player.vy;

        // Portal collision
        if (data.portal && !player.isSpecialActive) {
          if (nextX < data.portal.x + data.portal.w && nextX + player.w > data.portal.x && nextY < data.portal.y + data.portal.h && nextY + player.h > data.portal.y) {
            player.isSpecialActive = true;
            playTone(800, 'square', 0.5, 0.05);
          }
        }

        for (let p of data.platforms) {
          if (nextX < p.x + p.w && nextX + player.w > p.x && nextY < p.y + p.h && nextY + player.h > p.y) {
            if ((currentLevel === 4 || currentLevel === 3) && player.isSpecialActive) { triggerDie(); break; }
            if (player.y + player.h <= p.y + 12 && player.vy >= 0) {
              nextY = p.y - player.h;
              player.vy = 0;
              player.jumps = 0;
            } else {
              player.vx = 0;
              nextX = player.x;
            }
          }
        }

        player.x = nextX;
        player.y = nextY;

        // Spike collision for Level 3 and 4
        if (currentLevel === 3 || currentLevel === 4) {
          for (let s of data.spikes) {
            if (player.x < s.x + s.w && player.x + player.w > s.x && player.y < s.y + s.h && player.y + player.h > s.y) {
              triggerDie();
              break;
            }
          }
        }

        if (player.y > 450 || player.y < -150) triggerDie();
        if (player.invul > 0) player.invul--;
        if (player.superPowerTimer > 0) {
          player.superPowerTimer--;
          if (player.superPowerTimer <= 0) player.hasSuperPower = false;
        }

        data.enemies.forEach(e => {
          e.x += e.vx * e.dir;
          if (e.x < e.startX || e.x > e.endX) e.dir *= -1;
          if (player.x < e.x + e.w && player.x + player.w > e.x && player.y < e.y + e.h && player.y + player.h > e.y) {
            if (player.invul <= 0) {
              if (e.isHeavy) {
                if (player.hasSuperPower) {
                  e.dead = true;
                  setScore(s => s + 500);
                  playJump();
                } else {
                  triggerDie();
                }
              } else {
                if (player.vy > 0 && player.y + player.h < e.y + 15) {
                  player.vy = -8;
                  e.dead = true;
                  setScore(s => s + 200);
                  playJump();
                } else {
                  triggerDie();
                }
              }
            }
          }
        });
        data.enemies = data.enemies.filter(e => !e.dead);

        data.powerUps = data.powerUps.filter(p => {
          if (p.active && Math.hypot(player.x + player.w / 2 - p.x, player.y + player.h / 2 - p.y) < 35) {
            player.hasSuperPower = true;
            player.superPowerTimer = 300; // 5 seconds at 60fps
            playTone(900, 'square', 0.3, 0.05);
            return false;
          }
          return true;
        });

        data.coins = data.coins.filter(c => {
          if (Math.hypot(player.x + player.w / 2 - c.x, player.y + player.h / 2 - c.y) < 35) {
            setScore(s => s + 100);
            playCoin();
            return false;
          }
          return true;
        });

        // Checkpoints
        data.checkpoints.forEach(cp => {
          if (!cp.reached && Math.hypot(player.x + player.w / 2 - cp.x, player.y + player.h / 2 - cp.y) < 40) {
            cp.reached = true;
            data.lastCheckpoint = { x: cp.x, y: cp.y - 40 };
            playTone(600, 'sine', 0.3, 0.05); // Subtle sound for checkpoint
          }
        });

        data.cameraX += (player.x - 250 - data.cameraX) * 0.1;
        if (data.cameraX < 0) data.cameraX = 0;
        if (player.x > data.goalX) triggerWin();
      }

      // Draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      data.stars.forEach(s => {
        let sx = (s.x - data.cameraX * s.p) % 2000;
        if (sx < 0) sx += 2000;
        ctx.fillStyle = `rgba(255,255,255,${s.p})`;
        ctx.fillRect(sx, s.y, s.s, s.s);
      });

      const theme = ['#00f2ff', '#ff00ea', '#00ff41', '#f4ff00', '#ff0055'][currentLevel - 1] || '#00f2ff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = theme;
      ctx.lineWidth = 2;
      data.platforms.forEach(p => {
        if (p.x - data.cameraX > 850 || p.x + p.w - data.cameraX < -50) return;
        ctx.fillStyle = '#050515';
        ctx.strokeStyle = theme;
        ctx.fillRect(p.x - data.cameraX, p.y, p.w, p.h);
        ctx.strokeRect(p.x - data.cameraX, p.y, p.w, p.h);
      });

      // Spikes
      data.spikes.forEach(s => {
        if (s.x - data.cameraX > 850 || s.x + s.w - data.cameraX < -50) return;
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ff0000';
        ctx.beginPath();
        if (s.isTop) {
          ctx.moveTo(s.x - data.cameraX, s.y);
          ctx.lineTo(s.x + s.w / 2 - data.cameraX, s.y + s.h);
          ctx.lineTo(s.x + s.w - data.cameraX, s.y);
        } else {
          ctx.moveTo(s.x - data.cameraX, s.y + s.h);
          ctx.lineTo(s.x + s.w / 2 - data.cameraX, s.y);
          ctx.lineTo(s.x + s.w - data.cameraX, s.y + s.h);
        }
        ctx.fill();
      });

      ctx.shadowColor = '#f4ff00';
      ctx.fillStyle = '#f4ff00';
      data.coins.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x - data.cameraX, c.y + Math.sin(Date.now() / 200) * 5, 7, 0, Math.PI * 2);
        ctx.fill();
      });

      // PowerUps
      ctx.shadowColor = '#ff0055';
      ctx.fillStyle = '#ff0055';
      data.powerUps.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x - data.cameraX, p.y + Math.sin(Date.now() / 150) * 8, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('S', p.x - data.cameraX, p.y + Math.sin(Date.now() / 150) * 8 + 4);
        ctx.fillStyle = '#ff0055';
      });

      // Portal
      if (data.portal && !player.isSpecialActive) {
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff00ea';
        ctx.fillStyle = '#ff00ea';
        ctx.fillRect(data.portal.x - data.cameraX, data.portal.y, data.portal.w, data.portal.h);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(data.portal.x - data.cameraX + 5, data.portal.y + 5, data.portal.w - 10, data.portal.h - 10);
      }

      ctx.shadowColor = 'red';
      data.enemies.forEach(e => {
        ctx.fillStyle = e.isHeavy ? '#400' : '#222';
        ctx.fillRect(e.x - data.cameraX, e.y, e.w, e.h);
        ctx.fillStyle = 'red';
        let eyeX = e.dir > 0 ? e.x - data.cameraX + (e.isHeavy ? 28 : 20) : e.x - data.cameraX + 2;
        ctx.fillRect(eyeX, e.y + 10, e.isHeavy ? 10 : 8, e.isHeavy ? 10 : 8);
        if (e.isHeavy) {
          ctx.fillRect(eyeX, e.y + 25, e.isHeavy ? 10 : 8, e.isHeavy ? 10 : 8);
        }
      });

      // Checkpoints
      data.checkpoints.forEach(cp => {
        const x = cp.x - data.cameraX;
        const y = cp.y;
        ctx.shadowBlur = 10;
        ctx.shadowColor = cp.reached ? '#00ff41' : '#ff0000';
        ctx.fillStyle = cp.reached ? '#00ff41' : '#ff0000';
        
        // Draw a flag or pole
        ctx.fillRect(x, y - 40, 4, 40);
        ctx.beginPath();
        ctx.moveTo(x + 4, y - 40);
        ctx.lineTo(x + 20, y - 30);
        ctx.lineTo(x + 4, y - 20);
        ctx.fill();
      });

      ctx.save();
      ctx.translate(player.x - data.cameraX + player.w / 2, player.y + player.h / 2);
      if ((currentLevel === 4 || currentLevel === 3) && player.isSpecialActive) ctx.rotate(Math.atan2(player.vy, player.vx));
      
      const img = spriteImgRef.current;
      const useImg = img && img.complete && img.naturalWidth > 0;

      if (useImg && !player.hasSuperPower) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      } else {
        ctx.shadowBlur = player.hasSuperPower ? 30 : 15;
        ctx.shadowColor = player.hasSuperPower ? '#ff0055' : theme;
      }
      
      ctx.fillStyle = player.hasSuperPower ? '#ff0055' : theme;
      if (player.invul > 0 && Math.floor(Date.now() / 100) % 2) ctx.globalAlpha = 0.4;

      if (currentLevel === 3 && player.isSpecialActive) {
        // Rocket Shape
        ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
        ctx.beginPath();
        ctx.moveTo(player.w / 2, -player.h / 2);
        ctx.lineTo(player.w / 2 + 10, 0);
        ctx.lineTo(player.w / 2, player.h / 2);
        ctx.fill();
        
        // Rocket effect
        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur = 10;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(-player.w / 2 - 5 - Math.random() * 10, -5 + Math.random() * 10, 3 + Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (currentLevel === 4 && player.isSpecialActive) {
        // Arrow Shape
        ctx.beginPath();
        ctx.moveTo(-player.w / 2, -player.h / 2);
        ctx.lineTo(player.w / 2 + 5, 0);
        ctx.lineTo(-player.w / 2, player.h / 2);
        ctx.lineTo(-player.w / 4, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        // Standard Hero
        if (useImg) {
          const frameWidth = img.naturalWidth / 2;
          const frameHeight = img.naturalHeight;
          
          const isRunning = Math.abs(player.vx) > 0.5;
          const sx = isRunning ? frameWidth : 0;
          const sy = 0;
          
          // V izvorni sliki (sprite.png) lik med tekom gleda v levo, medtem ko pri miru gleda v desno.
          // Zato moramo pri teku obrniti sliko v nasprotno smer.
          const drawFacing = isRunning ? -player.facing : player.facing;
          ctx.scale(drawFacing, 1);
          
          // Draw image larger and offset to align with the hitbox
          // The images have transparent padding, so we draw them bigger than the hitbox
          const imgW = 120;
          const imgH = 120;
          
          ctx.drawImage(
            img, 
            sx, sy, frameWidth, frameHeight, 
            -imgW / 2 - 5, -imgH / 2 - 15, imgW, imgH
          );
          
          ctx.scale(drawFacing, 1);
        } else {
          ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
          ctx.fillStyle = 'white';
          let ex = player.facing > 0 ? 4 : -9;
          ctx.fillRect(ex, -10, 5, 5);
        }
      }
      
      ctx.restore();

      // Ciljna baterija
      const batteryX = data.goalX - data.cameraX;
      const batteryY = 300;
      const batteryW = 30;
      const batteryH = 50;
      
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00ff41';
      ctx.fillStyle = '#111';
      ctx.strokeStyle = '#00ff41';
      ctx.lineWidth = 2;
      
      // Telo baterije
      ctx.fillRect(batteryX, batteryY, batteryW, batteryH);
      ctx.strokeRect(batteryX, batteryY, batteryW, batteryH);
      
      // Kapica baterije
      ctx.fillRect(batteryX + 7, batteryY - 8, 16, 8);
      ctx.strokeRect(batteryX + 7, batteryY - 8, 16, 8);
      
      // Nivo napolnjenosti (animiran)
      const chargeLevel = (Math.sin(Date.now() / 200) + 1) / 2;
      ctx.fillStyle = '#00ff41';
      ctx.fillRect(batteryX + 4, batteryY + 4 + (batteryH - 8) * (1 - chargeLevel), batteryW - 8, (batteryH - 8) * chargeLevel);

      // Preverjanje kolizije z baterijo
      if (gameState === 'PLAYING') {
        if (player.x < data.goalX + batteryW && player.x + player.w > data.goalX && player.y < batteryY + batteryH && player.y + player.h > batteryY) {
          triggerWin();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animationFrameId);
      stopBgMusic();
    };
  }, [gameState, currentLevel]);

  const handleStart = (levelToStart?: number) => {
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    
    if (levelToStart !== undefined) {
      setCurrentLevel(levelToStart);
      setScore(0);
      setLives(3);
      initLevel(levelToStart);
    } else if (gameState === 'WIN') {
      setLives(3);
      if (currentLevel < 5) {
        const nextLv = currentLevel + 1;
        setCurrentLevel(nextLv);
        initLevel(nextLv);
      } else {
        setCurrentLevel(1);
        setScore(0);
        initLevel(1);
      }
    } else if (gameState === 'OVER') {
      setLives(3);
      setScore(prev => Math.max(0, prev - 500)); // Small penalty for game over
      initLevel(currentLevel);
    } else {
      initLevel(currentLevel);
    }
    
    setGameState('PLAYING');
    startBgMusic();
  };

  const setupBtn = (key: 'left' | 'right' | 'up') => {
    return {
      onMouseDown: (e: React.MouseEvent) => {
        e.preventDefault();
        if (key === 'up') handleInput();
        gameDataRef.current.keys[key] = true;
      },
      onTouchStart: (e: React.TouchEvent) => {
        e.preventDefault();
        if (key === 'up') handleInput();
        gameDataRef.current.keys[key] = true;
      },
      onMouseUp: () => gameDataRef.current.keys[key] = false,
      onMouseLeave: () => gameDataRef.current.keys[key] = false,
      onTouchEnd: () => gameDataRef.current.keys[key] = false,
    };
  };

  return (
    <div className="flex justify-center items-center h-screen w-screen bg-[#02020a]">
      <div id="game-container" className="relative w-[800px] h-[450px] bg-black border-2 border-[var(--neon-blue)] shadow-[0_0_30px_rgba(0,242,255,0.2)] overflow-hidden max-sm:w-screen max-sm:h-[56.25vw] max-sm:border-none">
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={450} 
          className="block w-full h-full"
          onMouseDown={(e) => { e.preventDefault(); handleInput(); }}
        />
        
        <div id="ui-layer" className="absolute top-[15px] left-[15px] right-[15px] flex justify-between pointer-events-none z-10">
          <div className="flex gap-4">
            <div className="stat-box"><span className="stat-label">Stopnja</span><span className="stat-value">{currentLevel}</span></div>
            <div className="stat-box"><span className="stat-label">Točke</span><span className="stat-value">{score}</span></div>
            <div className="stat-box"><span className="stat-label">Življenja</span><span className="stat-value">{lives}</span></div>
          </div>
          <button 
            className="pointer-events-auto bg-black/50 text-[var(--neon-blue)] border border-[var(--neon-blue)] px-3 py-1 rounded hover:bg-[var(--neon-blue)] hover:text-black transition-colors"
            onClick={() => {
              setGameState('START');
              stopBgMusic();
            }}
          >
            MENI
          </button>
        </div>

        <div id="controls" className="absolute bottom-[10px] left-0 w-full flex justify-between px-5 box-border z-20 opacity-40 hover:opacity-100 transition-opacity">
          <div className="flex gap-3">
            <div className="btn-control !w-14 !h-14 !text-xl" {...setupBtn('left')}>◀</div>
            <div className="btn-control !w-14 !h-14 !text-xl" {...setupBtn('right')}>▶</div>
          </div>
          <div className="btn-control btn-jump !w-14 !h-14 !text-xl" {...setupBtn('up')}>▲</div>
        </div>

        {(gameState === 'START' || gameState === 'OVER' || gameState === 'WIN') && (
          <div id="overlay" className="absolute inset-0 bg-black/95 flex flex-col justify-center items-center z-[100] text-center p-5">
            {gameState === 'WIN' && (
              <div id="win-ui">
                <div className="visualizer">
                  <div className="v-bar"></div>
                  <div className="v-bar" style={{ animationDelay: '0.1s' }}></div>
                  <div className="v-bar" style={{ animationDelay: '0.2s' }}></div>
                  <div className="v-bar" style={{ animationDelay: '0.3s' }}></div>
                </div>
                <h2 className="text-[var(--neon-green)] mb-2.5">SEKTOR OČIŠČEN!</h2>
              </div>
            )}
            <h1 className="text-[var(--neon-blue)] text-4xl m-0 font-bold">
              {gameState === 'START' ? 'SKAKAJOČI BOR' : gameState === 'OVER' ? 'SISTEM SESUT' : 'MISIJA OPRAVLJENA'}
            </h1>
            <p className="text-[#888] my-2.5 mb-5 text-sm">
              {gameState === 'START' ? 'Izberi stopnjo in premagaj digitalne drone.' : 
               gameState === 'OVER' ? 'Povezava prekinjena. Poskusi znova.' : 
               currentLevel === 3 ? 'Skoči v PORTAL za JETPACK in se izogni špicam!' :
               currentLevel === 4 ? 'Skoči v PORTAL za ZIG-ZAG in se izogni špicam!' : 
               currentLevel === 5 ? 'Poberi SUPER MOČ (S) da premagaš TEŽKE DRONE!' : 'Sektor je varen.'}
            </p>
            
            {gameState === 'START' ? (
              <div className="flex flex-col gap-3 w-full max-w-[300px]">
                {[1, 2, 3, 4, 5].map(lv => (
                  <button 
                    key={lv}
                    onClick={() => handleStart(lv)}
                    className="bg-transparent text-[var(--neon-blue)] border-2 border-[var(--neon-blue)] py-2 px-[20px] text-lg font-bold rounded-[50px] cursor-pointer shadow-[0_0_10px_var(--neon-blue)] transition-all duration-300 hover:bg-[var(--neon-blue)] hover:text-black"
                  >
                    STOPNJA {lv}
                  </button>
                ))}
              </div>
            ) : (
              <button 
                onClick={() => handleStart()}
                className="bg-transparent text-[var(--neon-blue)] border-2 border-[var(--neon-blue)] py-3 px-[35px] text-xl font-bold rounded-[50px] cursor-pointer shadow-[0_0_15px_var(--neon-blue)] transition-all duration-300 hover:bg-[var(--neon-blue)] hover:text-black"
              >
                PONOVNI ZAGON
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
