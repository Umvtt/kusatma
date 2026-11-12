package com.umvtt.kusatma;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Kuşatma is a web game. The app shows the live site full screen, so every game update reaches
 * players the moment it is published, with nothing to reinstall. If the main address is blocked
 * it falls back to the mirror. While the game loads, a native loading screen shows progress and
 * tips. The page can make the phone vibrate through the KusatmaApp bridge. A new app version is
 * downloaded and installed from inside the app (Android's own installer asks to confirm).
 */
public class MainActivity extends Activity {
    private static final String[] SITES = { "https://umvtt.github.io/kusatma/", "https://umvtt-games.umvtt.deno.net/kusatma/", "https://kusatma.umvtt.workers.dev/" };
    private static final String VERSION_URL = "app/version.json";
    private static final String DOWNLOAD = "app/kusatma.apk";
    private static final String INSTALL_DONE = "com.umvtt.kusatma.INSTALL_DONE";
    private static final int ORANGE = Color.rgb(255, 107, 44), BG = Color.rgb(13, 17, 15), TEXT = Color.rgb(236, 230, 214), DIM = Color.rgb(143, 154, 142);
    private static final String[] TIPS = {
        "İpucu: Sırt sırta verin, sürü her dalgada büyür.",
        "İpucu: Mola sırasında Cephanelik'ten silahını güçlendir.",
        "İpucu: Boss gelince kırmızı halkadan uzak dur.",
        "İpucu: Doktor düşen arkadaşlarını anında kaldırır.",
        "İpucu: Dipçik, Kalkanlı'nın kalkanını düşürür.",
        "İpucu: Günün Görevi'nde ilk 10 elmas kazanır.",
        "İpucu: Elitler parlar: daha güçlü ama 4 kat altın verir.",
        "İpucu: Ayarlardan grafik kalitesini değiştirebilirsin."
    };

    private WebView web;
    private int site = 0;
    private long lastBack = 0;
    private FrameLayout splash;
    private ProgressBar bar;
    private TextView status, tip;
    private ImageView logo;
    private int tipIdx = 0, shown = 0;
    private boolean loaded = false, gone = false;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable slow = () -> { if (!loaded) nextSite(); };
    private final Runnable tipper = new Runnable() {
        @Override public void run() {
            if (gone) return;
            tip.animate().alpha(0f).setDuration(220).withEndAction(() -> { tipIdx = (tipIdx + 1) % TIPS.length; tip.setText(TIPS[tipIdx]); tip.animate().alpha(1f).setDuration(260).start(); }).start();
            ui.postDelayed(this, 2800);
        }
    };
    // the progress bar moves smoothly toward the real progress, never backwards
    private final Runnable easer = new Runnable() {
        @Override public void run() {
            if (gone) return;
            int target = web == null ? 0 : web.getProgress();
            if (loaded) target = 100;
            if (shown < target) shown += Math.max(1, (target - shown) / 6);
            else if (shown < 92 && !loaded) shown += shown < 60 ? 1 : 0; // keeps creeping a little while the network is slow
            bar.setProgress(Math.min(100, shown));
            ui.postDelayed(this, 40);
        }
    };

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        // a game, not a page: no text-selection menu on long press, no system haptics on top of the game's own
        web.setLongClickable(false);
        web.setOnLongClickListener(v -> true);
        web.setHapticFeedbackEnabled(false);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        // keyboard: with the system bars hidden, push the page up by the keyboard's height ourselves
        if (Build.VERSION.SDK_INT >= 30) root.setOnApplyWindowInsetsListener((v, ins) -> { int b = ins.getInsets(WindowInsets.Type.ime()).bottom; web.setPadding(0, 0, 0, 0); FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams(); if (lp.bottomMargin != b) { lp.bottomMargin = b; web.setLayoutParams(lp); } return ins; });
        root.addView(web);
        root.addView(buildSplash(), new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        immersive();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // account, settings and records live in localStorage
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // game sounds
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setOffscreenPreRaster(true);                // smoother first frames
        s.setTextZoom(100);                           // the phone's font size setting must not break the game's layout
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " KusatmaApp/" + BuildConfig.VERSION_CODE);
        web.addJavascriptInterface(new Bridge(), "KusatmaApp");

        s.setMediaPlaybackRequiresUserGesture(false);  // teammates' voices play without a tap
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int p) { if (p > 60 && !loaded) status.setText("Oyun hazırlanıyor…"); }
            // voice chat: the page asks for the microphone; Android asks the player once, then the page gets it
            @Override public void onPermissionRequest(final PermissionRequest req) {
                ui.post(() -> {
                    boolean mic = false;
                    for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) mic = true;
                    if (!mic) { req.deny(); return; }
                    if (Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { req.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE }); return; }
                    micReq = req;
                    requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, 77);
                });
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (url.startsWith("retry:")) { site = 0; showSplash(); load(); return true; }
                for (String base : SITES) if (url.startsWith(base)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl())); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                nextSite(); // main address unreachable (offline, or blocked on this network)
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url.startsWith("file")) { loaded = true; hideSplash(); return; }
                if (url.startsWith("http")) { loaded = true; ui.removeCallbacks(slow); ui.postDelayed(MainActivity.this::hideSplash, 2500); } // the game says when it is ready; this is the fallback
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // the page's renderer crashed (low memory): start the app's screen again instead of staying black
                recreate();
                return true;
            }
        });

        load();
        checkForNewApp();
        Push.channel(this);
        try { com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t -> getSharedPreferences("kusatma", MODE_PRIVATE).edit().putString("push", t).apply()); } catch (Exception ignored) { } // only when app/version.json on the site names a newer app (the game itself always comes fresh)
    }

    private View buildSplash() {
        splash = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { Color.rgb(24, 31, 27), BG, Color.rgb(8, 10, 9) });
        splash.setBackground(bg);
        splash.setClickable(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        col.addView(logo, new LinearLayout.LayoutParams(dp(92), dp(92)));
        TextView title = new TextView(this);
        title.setText("KUŞATMA");
        title.setTextColor(TEXT);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
        title.setTypeface(Typeface.create("sans-serif-black", Typeface.BOLD));
        title.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(-2, -2); tl.topMargin = dp(14);
        col.addView(title, tl);
        View stripe = new View(this);
        GradientDrawable sd = new GradientDrawable(); sd.setColor(ORANGE); sd.setCornerRadius(dp(2)); stripe.setBackground(sd);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(dp(64), dp(4)); sl.topMargin = dp(8);
        col.addView(stripe, sl);
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(ColorStateList.valueOf(ORANGE));
        bar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.rgb(42, 52, 46)));
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(dp(240), dp(6)); bl.topMargin = dp(30);
        col.addView(bar, bl);
        status = new TextView(this);
        status.setText("Yükleniyor…");
        status.setTextColor(TEXT);
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        LinearLayout.LayoutParams stl = new LinearLayout.LayoutParams(-2, -2); stl.topMargin = dp(12);
        col.addView(status, stl);
        tip = new TextView(this);
        tip.setText(TIPS[0]);
        tip.setTextColor(DIM);
        tip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tip.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tpl = new LinearLayout.LayoutParams(dp(300), -2); tpl.topMargin = dp(8);
        col.addView(tip, tpl);
        FrameLayout.LayoutParams cl = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        splash.addView(col, cl);
        TextView ver = new TextView(this);
        ver.setText("Uygulama " + BuildConfig.VERSION_NAME);
        ver.setTextColor(Color.rgb(90, 100, 92));
        ver.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        FrameLayout.LayoutParams vl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL); vl.bottomMargin = dp(14);
        splash.addView(ver, vl);
        // gentle pulse on the logo
        logo.animate().scaleX(1.06f).scaleY(1.06f).setDuration(900).setInterpolator(new AccelerateDecelerateInterpolator()).withEndAction(this::pulseBack).start();
        tipIdx = (int) (Math.random() * TIPS.length); tip.setText(TIPS[tipIdx]);
        ui.postDelayed(tipper, 2800);
        ui.post(easer);
        return splash;
    }

    private void pulseBack() {
        if (gone) return;
        logo.animate().scaleX(1f).scaleY(1f).setDuration(900).withEndAction(() -> { if (!gone) logo.animate().scaleX(1.06f).scaleY(1.06f).setDuration(900).withEndAction(this::pulseBack).start(); }).start();
    }

    private void showSplash() {
        gone = false; shown = 0; bar.setProgress(0);
        splash.setAlpha(1f); splash.setVisibility(View.VISIBLE);
        status.setText("Yükleniyor…");
        ui.removeCallbacks(tipper); ui.postDelayed(tipper, 2800); ui.post(easer); pulseBack();
    }

    private void hideSplash() {
        if (gone) return;
        gone = true; shown = 100; bar.setProgress(100);
        ui.removeCallbacks(tipper);
        splash.animate().alpha(0f).setDuration(350).withEndAction(() -> splash.setVisibility(View.GONE)).start();
    }

    private void load() {
        loaded = false;
        ui.removeCallbacks(slow);
        ui.postDelayed(slow, 10000); // no page after 10 s: try the next address
        status.setText(site == 0 ? "Sunucuya bağlanılıyor…" : "Yedek sunucu deneniyor…");
        String link = getIntent() != null ? getIntent().getStringExtra("link") : null;
        web.loadUrl(SITES[site] + (link != null && link.matches("[a-z/]{0,40}") ? link : "") + "?app=" + BuildConfig.VERSION_CODE);
    }

    // a tapped notification while the app is already running: go to the page it points at
    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        String link = i.getStringExtra("link");
        if (link != null && link.matches("[a-z/]{0,40}") && web != null && loaded) web.loadUrl(SITES[site] + link + "?app=" + BuildConfig.VERSION_CODE);
    }
    static boolean open = false;


    /** The mirror, then the offline page with a retry button. */
    private void nextSite() {
        ui.removeCallbacks(slow);
        if (site + 1 < SITES.length) { site++; load(); }
        else { loaded = true; hideSplash(); web.loadUrl("file:///android_asset/offline.html"); }
    }

    /** What the page can ask of the app. */
    private class Bridge {
        @JavascriptInterface public void ready() { ui.post(MainActivity.this::hideSplash); }
        // push notifications: the page sends this token to the server with the player's account
        @JavascriptInterface public String pushToken() { return getSharedPreferences("kusatma", MODE_PRIVATE).getString("push", ""); }
        @JavascriptInterface public boolean pushAllowed() { return Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED; }
        @JavascriptInterface public void pushAsk() { ui.post(() -> { if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 78); }); }
        @JavascriptInterface public int version() { return BuildConfig.VERSION_CODE; }
        @JavascriptInterface public void vibrate(String pattern) {
            try {
                JSONArray a = new JSONArray(pattern);
                int n = Math.min(12, a.length());
                if (n == 0) return;
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                if (n == 1) { long ms = Math.max(5, Math.min(1000, a.getLong(0))); if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)); else v.vibrate(ms); return; }
                long[] t = new long[n + 1]; t[0] = 0;
                for (int i = 0; i < n; i++) t[i + 1] = Math.max(5, Math.min(1000, a.getLong(i)));
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(t, -1)); else v.vibrate(t, -1);
            } catch (Exception ignored) { }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive(); }

    @Override
    protected void onPause() { super.onPause(); open = false; web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); open = true; web.onResume(); immersive(); }

    /** Back works like Esc in the game (menus, dialogs); on the main menu, pressing twice closes the app. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.kusatmaBack ? window.kusatmaBack() : 'exit'", v -> {
            if (v != null && v.contains("handled")) return;
            long now = System.currentTimeMillis();
            if (now - lastBack < 2000) { finish(); return; }
            lastBack = now;
            Toast.makeText(this, "Çıkmak için tekrar bas", Toast.LENGTH_SHORT).show();
        });
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            // older Android: hide both bars, swipe from the edge to see them for a moment
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** app/version.json on the site holds the newest app number; a higher number than this app's means a new APK is out. */
    /**
     * The app only asks for an update when it has to: app/version.json carries "min", the oldest app build that may still
     * be used. Below it (an important change, such as a new permission) a screen that can't be skipped sends the player to
     * the site's update page; above it nothing is ever asked, because the game itself always comes fresh from the site.
     */
    private void checkForNewApp() {
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(SITES[0] + VERSION_URL + "?t=" + System.currentTimeMillis()).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line);
                }
                JSONObject j = new JSONObject(sb.toString());
                int min = j.optInt("min", 0);
                if (min <= BuildConfig.VERSION_CODE) return;
                String notes = j.optString("notes", "");
                ui.postDelayed(() -> new AlertDialog.Builder(this)
                    .setTitle("Önemli güncelleme")
                    .setMessage("Kuşatma'nın bu sürümü artık kullanılamıyor. Oynamaya devam etmek için uygulamayı güncelle." + (notes.isEmpty() ? "" : "\n\n" + notes) + "\n\nHesabın ve ilerlemen aynı kalır.")
                    .setCancelable(false)
                    .setPositiveButton("Güncelle", (d, w) -> {
                        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(SITES[0] + "?guncelle=1"))); } catch (Exception ignored) { }
                        finish();
                    })
                    .show(), 800);
            } catch (Exception ignored) {
                // offline: play on
            }
        }).start();
    }

    /** Downloads the new APK with a progress bar and hands it to Android's installer. */
    private void downloadUpdate() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(16), dp(24), dp(8));
        ProgressBar pb = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pb.setMax(100);
        pb.setProgressTintList(ColorStateList.valueOf(ORANGE));
        TextView pt = new TextView(this);
        pt.setText("İndiriliyor… %0");
        box.addView(pb, new LinearLayout.LayoutParams(-1, dp(8)));
        LinearLayout.LayoutParams pl = new LinearLayout.LayoutParams(-2, -2); pl.topMargin = dp(10);
        box.addView(pt, pl);
        AlertDialog dlg = new AlertDialog.Builder(this).setTitle("Güncelleniyor").setView(box).setCancelable(false).show();
        new Thread(() -> {
            PackageInstaller.Session session = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(SITES[0] + DOWNLOAD + "?t=" + System.currentTimeMillis()).openConnection();
                c.setConnectTimeout(10000);
                c.setReadTimeout(20000);
                int total = c.getContentLength();
                PackageInstaller pi = getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(getPackageName());
                if (total > 0) params.setSize(total);
                int sid = pi.createSession(params);
                session = pi.openSession(sid);
                try (InputStream in = c.getInputStream(); OutputStream out = session.openWrite("kusatma.apk", 0, total > 0 ? total : -1)) {
                    byte[] buf = new byte[32768];
                    long got = 0; int n, lastPct = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n); got += n;
                        if (total > 0) { int pct = (int) (got * 100 / total); if (pct != lastPct) { lastPct = pct; ui.post(() -> { pb.setProgress(pct); pt.setText("İndiriliyor… %" + pct); }); } }
                    }
                    session.fsync(out);
                }
                ui.post(() -> pt.setText("Kuruluyor…"));
                Intent done = new Intent(INSTALL_DONE).setPackage(getPackageName());
                int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent pend = PendingIntent.getBroadcast(this, sid, done, flags);
                registerInstallReceiver(dlg);
                session.commit(pend.getIntentSender());
                session.close();
            } catch (Exception e) {
                if (session != null) try { session.abandon(); } catch (Exception ignored) { }
                ui.post(() -> {
                    dlg.dismiss();
                    // fall back to the browser download
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(SITES[0] + DOWNLOAD))); } catch (Exception ignored) { }
                });
            }
        }).start();
    }

    private void registerInstallReceiver(AlertDialog dlg) {
        BroadcastReceiver r = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent it) {
                int st = it.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = it.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); try { startActivity(confirm); } catch (Exception ignored) { } }
                    return;
                }
                try { unregisterReceiver(this); } catch (Exception ignored) { }
                dlg.dismiss();
                if (st != PackageInstaller.STATUS_SUCCESS) Toast.makeText(ctx, "Güncelleme kurulamadı. Sitedeki indirme bağlantısını deneyebilirsin.", Toast.LENGTH_LONG).show();
            }
        };
        IntentFilter f = new IntentFilter(INSTALL_DONE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(r, f);
    }

    private PermissionRequest micReq;
    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code != 77 || micReq == null) return;
        if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) micReq.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE }); else micReq.deny();
        micReq = null;
    }
}
