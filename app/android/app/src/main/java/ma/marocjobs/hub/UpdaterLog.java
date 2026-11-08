package ma.marocjobs.hub;

import android.util.Log;

import java.util.ArrayDeque;
import java.util.Deque;

/** Journal circulaire en memoire (20 dernieres lignes) pour le diagnostic updater. */
public final class UpdaterLog {
    private static final String TAG = "ApkUpdater";
    private static final int MAX = 20;
    private static final Deque<String> LINES = new ArrayDeque<>();

    private UpdaterLog() {}

    public static synchronized void add(String msg) {
        String line = System.currentTimeMillis() + " " + (msg == null ? "" : msg);
        LINES.addLast(line);
        while (LINES.size() > MAX) LINES.removeFirst();
        Log.d(TAG, msg);
    }

    public static synchronized String toJson() {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (String s : LINES) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(s.replace("\\", "\\\\").replace("\"", "\\\"")).append("\"");
        }
        return sb.append("]").toString();
    }
}
