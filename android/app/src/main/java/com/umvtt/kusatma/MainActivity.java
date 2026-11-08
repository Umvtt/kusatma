package com.umvtt.kusatma;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Kuşatma is a web game. The app shows the live site full screen, so every game update reaches
 * players the moment it is published, with nothing to reinstall. If the main address is blocked
 * it falls back to the mirror. Only changes to this app itself (rare) need a new APK; the app
 * checks the site's app/version.json for one and offers it.
 */
public class MainActivity extends Activity {
    private static final String[] SITES = { "https://umvtt.github.io/kusatma/", "https://umvtt-games.umvtt.deno.net/kusatma/" };
    private static final String VERSION_URL = "app/version.json";
    private static final String DOWNLOAD = "app/kusatma.apk";

    private WebView web;
    private int site = 0;
    private long lastBack = 0;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(13, 17, 15));
        setContentView(web);
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
        s.setUserAgentString(s.getUserAgentString() + " KusatmaApp/" + BuildConfig.VERSION_CODE);

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                if (url.startsWith("retry:")) { site = 0; load(); return true; }
                for (String base : SITES) if (url.startsWith(base)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl())); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                // main address unreachable (offline, or blocked on this network): try the mirror, then show the offline page
                if (site + 1 < SITES.length) { site++; load(); }
                else view.loadUrl("file:///android_asset/offline.html");
            }
        });

        if (state != null) web.restoreState(state);
        else load();
        checkForNewApp();
    }

    private void load() { web.loadUrl(SITES[site] + "?app=" + BuildConfig.VERSION_CODE); }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive(); }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); immersive(); }

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
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    /** app/version.json on the site holds the newest app number; a higher number than this app's means a new APK is out. */
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
                int latest = new JSONObject(sb.toString()).optInt("v", 0);
                if (latest <= BuildConfig.VERSION_CODE) return;
                ui.post(() -> new AlertDialog.Builder(this)
                    .setTitle("Uygulama güncellemesi")
                    .setMessage("Kuşatma uygulamasının yeni sürümü çıktı. Oyunun kendisi zaten hep güncel; bu sadece uygulamayı yeniler.")
                    .setPositiveButton("İndir", (d, w) -> {
                        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(SITES[0] + DOWNLOAD))); } catch (Exception ignored) { }
                    })
                    .setNegativeButton("Sonra", null)
                    .show());
            } catch (Exception ignored) {
                // offline or no release yet
            }
        }).start();
    }
}
