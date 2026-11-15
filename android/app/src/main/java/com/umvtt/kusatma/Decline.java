package com.umvtt.kusatma;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** app 49: "Reddet" on a ringing call notification just stops the ringing (the caller's side times out). */
public class Decline extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(i.getIntExtra("id", 0));
    }
}
