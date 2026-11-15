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

    // app 49: a friend calling rings like a phone call (own channel with the ringtone, repeats until answered or
    // dismissed, shows over the lock screen); the server cancels it when the caller hangs up ("callend")
    static final String CALL = "kusatma-call";
    static void callChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CALL) != null) return;
        NotificationChannel ch = new NotificationChannel(CALL, "Aramalar", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Arkadaşların seni sesli aradığında telefon gibi çalar");
        ch.setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE),
            new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ch.enableVibration(true); ch.setVibrationPattern(new long[] { 0, 800, 600, 800, 600 });
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
    static int callId(String cid) { return 0x5000 + Math.abs((cid == null ? "" : cid).hashCode() % 0x1000); }
    private void call(RemoteMessage m) {
        java.util.Map<String, String> d = m.getData();
        String cid = d.get("cid"), name = d.get("n");
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        if ("callend".equals(d.get("type"))) { nm.cancel(callId(cid)); return; }
        callChannel(this);
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("link", "oyun/arkadaslar").putExtra("call", callId(cid));
        PendingIntent open = PendingIntent.getActivity(this, callId(cid), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent no = new Intent(this, Decline.class).putExtra("id", callId(cid));
        PendingIntent dec = PendingIntent.getBroadcast(this, callId(cid), no, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new android.app.Notification.Builder(this, CALL) : new android.app.Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat).setColor(0xFF22C55E).setContentTitle("📞 " + (name == null ? "Arkadaşın" : name))
            .setContentText("Kuşatma'dan sesli arama · açmak için dokun").setCategory(android.app.Notification.CATEGORY_CALL)
            .setPriority(android.app.Notification.PRIORITY_MAX).setOngoing(true).setAutoCancel(true).setContentIntent(open).setFullScreenIntent(open, true)
            .addAction(new android.app.Notification.Action.Builder(null, "Reddet", dec).build())
            .addAction(new android.app.Notification.Action.Builder(null, "Aç", open).build());
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(45000);
        android.app.Notification n = b.build(); n.flags |= android.app.Notification.FLAG_INSISTENT;
        nm.notify(callId(cid), n);
    }

    @Override public void onMessageReceived(RemoteMessage m) {
        String ty = m.getData().get("type");
        if ("call".equals(ty) || "callend".equals(ty)) { call(m); return; }
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
