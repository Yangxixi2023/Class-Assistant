using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

class SmartClassroom : Form {
    Label statusLabel;
    Label urlLabel;
    Button startBtn;
    Button stopBtn;
    Button openBtn;
    TextBox logBox;
    Process serverProc;
    NotifyIcon trayIcon;
    bool running = false;

    static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SmartClassroom());
    }

    SmartClassroom() {
        Text = "智慧课堂 - Class Assistant";
        Size = new Size(520, 400);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;

        string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "public", "assets", "app-icon.ico");
        if (File.Exists(iconPath)) {
            Icon = new Icon(iconPath);
        }

        var titleLabel = new Label {
            Text = "智慧课堂",
            Font = new Font("Microsoft YaHei UI", 16, FontStyle.Bold),
            Location = new Point(20, 15),
            Size = new Size(200, 35),
            ForeColor = Color.FromArgb(16, 185, 129)
        };

        var subtitleLabel = new Label {
            Text = "AI 驱动的雨课堂实时课件解析助手",
            Font = new Font("Microsoft YaHei UI", 9),
            Location = new Point(22, 48),
            Size = new Size(300, 20),
            ForeColor = Color.Gray
        };

        statusLabel = new Label {
            Text = "● 就绪",
            Font = new Font("Microsoft YaHei UI", 9),
            Location = new Point(20, 80),
            Size = new Size(300, 20),
            ForeColor = Color.FromArgb(100, 100, 100)
        };

        urlLabel = new Label {
            Text = "",
            Font = new Font("Consolas", 9),
            Location = new Point(20, 102),
            Size = new Size(350, 20),
            ForeColor = Color.FromArgb(16, 185, 129),
            Cursor = Cursors.Hand
        };
        urlLabel.Click += (s, e) => { if (running) OpenDashboard(); };

        startBtn = new Button {
            Text = "启动",
            Font = new Font("Microsoft YaHei UI", 9, FontStyle.Bold),
            Location = new Point(20, 130),
            Size = new Size(80, 32),
            BackColor = Color.FromArgb(16, 185, 129),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        startBtn.FlatAppearance.BorderSize = 0;
        startBtn.Click += (s, e) => StartServer();

        stopBtn = new Button {
            Text = "停止",
            Font = new Font("Microsoft YaHei UI", 9),
            Location = new Point(110, 130),
            Size = new Size(80, 32),
            Enabled = false,
            FlatStyle = FlatStyle.Flat
        };
        stopBtn.FlatAppearance.BorderSize = 1;
        stopBtn.Click += (s, e) => StopServer();

        openBtn = new Button {
            Text = "打开面板",
            Font = new Font("Microsoft YaHei UI", 9),
            Location = new Point(200, 130),
            Size = new Size(80, 32),
            Enabled = false,
            FlatStyle = FlatStyle.Flat
        };
        openBtn.FlatAppearance.BorderSize = 1;
        openBtn.Click += (s, e) => OpenDashboard();

        logBox = new TextBox {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Location = new Point(20, 175),
            Size = new Size(465, 175),
            Font = new Font("Consolas", 8.5f),
            BackColor = Color.FromArgb(250, 248, 245),
            BorderStyle = BorderStyle.FixedSingle
        };

        Controls.AddRange(new Control[] { titleLabel, subtitleLabel, statusLabel, urlLabel, startBtn, stopBtn, openBtn, logBox });

        trayIcon = new NotifyIcon {
            Text = "智慧课堂",
            Visible = false
        };
        if (File.Exists(iconPath)) trayIcon.Icon = new Icon(iconPath);
        trayIcon.DoubleClick += (s, e) => { Show(); WindowState = FormWindowState.Normal; trayIcon.Visible = false; };

        FormClosing += OnFormClosing;

        Log("就绪。点击「启动」开始。");
        Log("需要 Node.js 18+ 已安装。");
    }

    void StartServer() {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string envDefault = Path.Combine(dir, ".env.default");
        string envFile = Path.Combine(dir, ".env");

        if (!File.Exists(envFile) && File.Exists(envDefault)) {
            File.Copy(envDefault, envFile);
            Log("已创建默认配置。");
        }

        if (!Directory.Exists(Path.Combine(dir, "node_modules"))) {
            Log("首次运行，正在安装依赖...");
            statusLabel.Text = "● 安装依赖中...";
            statusLabel.ForeColor = Color.Orange;
            startBtn.Enabled = false;

            var installThread = new Thread(() => {
                RunSync(dir, "npm", "install");
                Invoke(new Action(() => { DoStartNode(dir); }));
            });
            installThread.IsBackground = true;
            installThread.Start();
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
            serverProc.OutputDataReceived += (s, e) => { if (e.Data != null) Invoke(new Action(() => Log(e.Data))); };
            serverProc.ErrorDataReceived += (s, e) => { if (e.Data != null) Invoke(new Action(() => Log("[err] " + e.Data))); };
            serverProc.EnableRaisingEvents = true;
            serverProc.Exited += (s, e) => {
                Invoke(new Action(() => {
                    running = false;
                    statusLabel.Text = "● 已停止";
                    statusLabel.ForeColor = Color.Gray;
                    urlLabel.Text = "";
                    startBtn.Enabled = true;
                    stopBtn.Enabled = false;
                    openBtn.Enabled = false;
                    Log("服务已停止。");
                }));
            };

            serverProc.Start();
            serverProc.BeginOutputReadLine();
            serverProc.BeginErrorReadLine();

            running = true;
            statusLabel.Text = "● 运行中";
            statusLabel.ForeColor = Color.FromArgb(16, 185, 129);
            urlLabel.Text = "http://127.0.0.1:3000  (点击打开)";
            startBtn.Enabled = false;
            stopBtn.Enabled = true;
            openBtn.Enabled = true;
            Log("服务已启动。");

            // Auto open after short delay
            var t = new System.Windows.Forms.Timer { Interval = 2000 };
            t.Tick += (s2, e2) => { t.Stop(); OpenDashboard(); };
            t.Start();

        } catch (Exception ex) {
            Log("启动失败: " + ex.Message);
            Log("请确认 Node.js 18+ 已安装: https://nodejs.org/");
            statusLabel.Text = "● 错误";
            statusLabel.ForeColor = Color.Red;
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

    void OnFormClosing(object sender, FormClosingEventArgs e) {
        if (running) {
            e.Cancel = true;
            Hide();
            trayIcon.Visible = true;
            trayIcon.ShowBalloonTip(2000, "智慧课堂", "程序在后台运行中，双击托盘图标恢复。", ToolTipIcon.Info);
        } else {
            StopServer();
            trayIcon.Dispose();
        }
    }

    void RunSync(string dir, string cmd, string args) {
        var p = new Process();
        p.StartInfo = new ProcessStartInfo {
            FileName = cmd,
            Arguments = args,
            WorkingDirectory = dir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true
        };
        p.Start();
        while (!p.StandardOutput.EndOfStream) {
            string line = p.StandardOutput.ReadLine();
            Invoke(new Action(() => Log(line)));
        }
        p.WaitForExit();
    }

    void Log(string msg) {
        if (string.IsNullOrEmpty(msg)) return;
        string ts = DateTime.Now.ToString("HH:mm:ss");
        logBox.AppendText("[" + ts + "] " + msg + Environment.NewLine);
    }
}
