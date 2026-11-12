package com.umvtt.kusatma;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Push notifications from the game's server (through Firebase): friend requests, messages, clan invites and the
 * owner's announcements. The server only sends player notices while that player is not connected, so they are shown
 * even when the app is in front (the owner's announcements included).
 */
public class Push extends FirebaseMessagingService {
    static final String CHANNEL = "kusatma";

    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Kuşatma", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Mesajlar, arkadaşlık istekleri, davetler ve duyurular");
        nm.createNotificationChannel(ch);
    }

    @Override public void onNewToken(String token) {
        getSharedPreferences("kusatma", MODE_PRIVATE).edit().putString("push", token).apply();
    }

    @Override public void onMessageReceived(RemoteMessage m) {
        String title = m.getData().get("title"), body = m.getData().get("body"), link = m.getData().get("link");
        if (m.getNotification() != null) { title = m.getNotification().getTitle(); body = m.getNotification().getBody(); }
        if (title == null) return;
        channel(this);
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (link != null) i.putExtra("link", link);
        PendingIntent pi = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new android.app.Notification.Builder(this, CHANNEL) : new android.app.Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(body).setAutoCancel(true).setContentIntent(pi).setColor(0xFFFF6B2C);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify((int) (System.currentTimeMillis() & 0xfffffff), b.build());
    }
}
