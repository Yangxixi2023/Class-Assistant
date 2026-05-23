using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Threading;
using System.Windows.Forms;

class SmartClassroom : Form {
    Panel header;
    Label titleLabel, subtitleLabel, statusLabel, urlLabel;
    Button startBtn, stopBtn, openBtn, reloginBtn;
    RichTextBox logBox;
    Process serverProc;
    NotifyIcon trayIcon;
    bool running = false;
    Color accentColor = Color.FromArgb(16, 185, 129);
    Color bgColor = Color.FromArgb(24, 24, 27);
    Color surfaceColor = Color.FromArgb(39, 39, 42);
    Color borderColor = Color.FromArgb(63, 63, 70);
    Color textColor = Color.FromArgb(244, 244, 245);
    Color textDim = Color.FromArgb(161, 161, 170);

    static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SmartClassroom());
    }

    SmartClassroom() {
        Text = "智慧课堂";
        Size = new Size(560, 460);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        BackColor = bgColor;
        ForeColor = textColor;

        string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "public", "assets", "app-icon.ico");
        if (File.Exists(iconPath)) Icon = new Icon(iconPath);

        header = new Panel {
            Dock = DockStyle.Top,
            Height = 80,
            BackColor = surfaceColor,
            Padding = new Padding(20, 0, 20, 0)
        };
        header.Paint += (s, e) => {
            using (var pen = new Pen(borderColor)) {
                e.Graphics.DrawLine(pen, 0, header.Height - 1, header.Width, header.Height - 1);
            }
        };

        var iconBox = new PictureBox {
            Size = new Size(40, 40),
            Location = new Point(20, 20),
            SizeMode = PictureBoxSizeMode.StretchImage,
            BackColor = Color.Transparent
        };
        string pngPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "public", "assets", "brand-icon-64.png");
        if (File.Exists(pngPath)) iconBox.Image = Image.FromFile(pngPath);

        titleLabel = new Label {
            Text = "智慧课堂",
            Font = new Font("Microsoft YaHei UI", 15, FontStyle.Bold),
            Location = new Point(68, 16),
            Size = new Size(200, 28),
            ForeColor = textColor,
            BackColor = Color.Transparent
        };

        subtitleLabel = new Label {
            Text = "AI 驱动的雨课堂实时课件解析",
            Font = new Font("Microsoft YaHei UI", 9),
            Location = new Point(70, 46),
            Size = new Size(300, 18),
            ForeColor = textDim,
            BackColor = Color.Transparent
        };

        header.Controls.AddRange(new Control[] { iconBox, titleLabel, subtitleLabel });

        statusLabel = new Label {
            Text = "● 就绪",
            Font = new Font("Microsoft YaHei UI", 9),
            Location = new Point(20, 92),
            Size = new Size(400, 20),
            ForeColor = textDim
        };

        urlLabel = new Label {
            Text = "",
            Font = new Font("Consolas", 9),
            Location = new Point(20, 114),
            Size = new Size(350, 20),
            ForeColor = accentColor,
            Cursor = Cursors.Hand
        };
        urlLabel.Click += (s, e) => { if (running) OpenDashboard(); };

        startBtn = MakeButton("启 动", accentColor, Color.White, new Point(20, 145));
        stopBtn = MakeButton("停 止", surfaceColor, textDim, new Point(115, 145));
        stopBtn.Enabled = false;
        openBtn = MakeButton("打开面板", surfaceColor, textDim, new Point(210, 145));
        openBtn.Enabled = false;
        reloginBtn = MakeButton("重新登录", surfaceColor, textDim, new Point(325, 145));
        reloginBtn.Enabled = false;

        startBtn.Click += (s, e) => StartServer();
        stopBtn.Click += (s, e) => StopServer();
        openBtn.Click += (s, e) => OpenDashboard();
        reloginBtn.Click += (s, e) => Relogin();

        logBox = new RichTextBox {
            Location = new Point(20, 190),
            Size = new Size(505, 215),
            Font = new Font("Consolas", 8.5f),
            BackColor = Color.FromArgb(30, 30, 33),
            ForeColor = textDim,
            ReadOnly = true,
            BorderStyle = BorderStyle.None,
            ScrollBars = RichTextBoxScrollBars.Vertical,
            DetectUrls = false
        };

        Controls.AddRange(new Control[] { header, statusLabel, urlLabel, startBtn, stopBtn, openBtn, reloginBtn, logBox });

        trayIcon = new NotifyIcon { Text = "智慧课堂", Visible = false };
        if (File.Exists(iconPath)) trayIcon.Icon = new Icon(iconPath);
        trayIcon.DoubleClick += (s, e) => { Show(); WindowState = FormWindowState.Normal; trayIcon.Visible = false; };

        FormClosing += OnFormClosing;

        Log("就绪。点击「启动」开始。", textDim);
    }

    Button MakeButton(string text, Color bg, Color fg, Point loc) {
        var btn = new Button {
            Text = text,
            Font = new Font("Microsoft YaHei UI", 9, FontStyle.Bold),
            Location = loc,
            Size = new Size(88, 32),
            BackColor = bg,
            ForeColor = fg,
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand
        };
        btn.FlatAppearance.BorderColor = borderColor;
        btn.FlatAppearance.BorderSize = 1;
        btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(
            Math.Min(bg.R + 20, 255), Math.Min(bg.G + 20, 255), Math.Min(bg.B + 20, 255));
        return btn;
    }

    void StartServer() {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string envDefault = Path.Combine(dir, ".env.default");
        string envFile = Path.Combine(dir, ".env");

        if (!File.Exists(envFile) && File.Exists(envDefault)) {
            File.Copy(envDefault, envFile);
            Log("已创建默认配置。", accentColor);
        }

        if (!Directory.Exists(Path.Combine(dir, "node_modules"))) {
            Log("首次运行，正在安装依赖（请稍候）...", Color.FromArgb(251, 191, 36));
            SetStatus("安装依赖中...", Color.FromArgb(251, 191, 36));
            startBtn.Enabled = false;

            var t = new Thread(() => {
                RunSync(dir, "npm", "install");
                Invoke(new Action(() => DoStartNode(dir)));
            });
            t.IsBackground = true;
            t.Start();
            return;
        }

        DoStartNode(dir);
    }

    void DoStartNode(string dir) {
        try {
            serverProc = new Process();
            serverProc.StartInfo = new ProcessStartInfo {
                FileName = "node",
                Arguments = "src/server.js",
                WorkingDirectory = dir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            serverProc.OutputDataReceived += (s, e) => {
                if (e.Data != null) Invoke(new Action(() => Log(e.Data, textDim)));
            };
            serverProc.ErrorDataReceived += (s, e) => {
                if (e.Data != null) Invoke(new Action(() => Log(e.Data, Color.FromArgb(239, 68, 68))));
            };
            serverProc.EnableRaisingEvents = true;
            serverProc.Exited += (s, e) => {
                Invoke(new Action(() => {
                    running = false;
                    SetStatus("已停止", textDim);
                    urlLabel.Text = "";
                    startBtn.Enabled = true;
                    stopBtn.Enabled = false;
                    openBtn.Enabled = false;
                    reloginBtn.Enabled = false;
                    Log("服务已停止。", textDim);
                }));
            };

            serverProc.Start();
            serverProc.BeginOutputReadLine();
            serverProc.BeginErrorReadLine();

            running = true;
            SetStatus("运行中", accentColor);
            urlLabel.Text = "http://127.0.0.1:3000  点击打开";
            startBtn.Enabled = false;
            stopBtn.Enabled = true;
            openBtn.Enabled = true;
            reloginBtn.Enabled = true;
            Log("服务已启动。", accentColor);

            var timer = new System.Windows.Forms.Timer { Interval = 2500 };
            timer.Tick += (s2, e2) => { timer.Stop(); OpenDashboard(); };
            timer.Start();

        } catch (Exception ex) {
            Log("启动失败: " + ex.Message, Color.FromArgb(239, 68, 68));
            SetStatus("错误", Color.FromArgb(239, 68, 68));
            startBtn.Enabled = true;
        }
    }

    void StopServer() {
        if (serverProc != null && !serverProc.HasExited) {
            try { serverProc.Kill(); } catch { }
        }
    }

    void OpenDashboard() {
        try { Process.Start(new ProcessStartInfo("http://127.0.0.1:3000") { UseShellExecute = true }); } catch { }
    }

    void Relogin() {
        try {
            var wc = new System.Net.WebClient();
            wc.Headers.Add("Content-Type", "application/json");
            wc.UploadString("http://127.0.0.1:3000/api/relogin", "{}");
            Log("已发送重登录请求，请在浏览器中登录。", Color.FromArgb(251, 191, 36));
        } catch (Exception ex) {
            Log("重登录失败: " + ex.Message, Color.FromArgb(239, 68, 68));
        }
    }

    void OnFormClosing(object sender, FormClosingEventArgs e) {
        if (running) {
            e.Cancel = true;
            Hide();
            trayIcon.Visible = true;
            trayIcon.ShowBalloonTip(2000, "智慧课堂", "后台运行中，双击托盘图标恢复。", ToolTipIcon.Info);
        } else {
            StopServer();
            trayIcon.Dispose();
        }
    }

    void RunSync(string dir, string cmd, string args) {
        var p = new Process();
        p.StartInfo = new ProcessStartInfo {
            FileName = cmd, Arguments = args, WorkingDirectory = dir,
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true
        };
        p.Start();
        while (!p.StandardOutput.EndOfStream) {
            string line = p.StandardOutput.ReadLine();
            Invoke(new Action(() => Log(line, textDim)));
        }
        p.WaitForExit();
    }

    void SetStatus(string text, Color color) {
        statusLabel.Text = "● " + text;
        statusLabel.ForeColor = color;
    }

    void Log(string msg, Color color) {
        if (string.IsNullOrEmpty(msg)) return;
        string ts = DateTime.Now.ToString("HH:mm:ss");
        logBox.SelectionStart = logBox.TextLength;
        logBox.SelectionColor = Color.FromArgb(82, 82, 91);
        logBox.AppendText("[" + ts + "] ");
        logBox.SelectionStart = logBox.TextLength;
        logBox.SelectionColor = color;
        logBox.AppendText(msg + Environment.NewLine);
        logBox.ScrollToCaret();
    }
}
