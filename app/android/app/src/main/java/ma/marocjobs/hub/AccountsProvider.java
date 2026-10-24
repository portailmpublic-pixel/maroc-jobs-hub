package ma.marocjobs.hub;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;

/**
 * Expose les comptes locaux à l'APK admin (ma.marocjobs.hub.admin).
 * Lecture protégée par la permission signature READ_ACCOUNTS :
 * seule une application signée avec la même clé peut interroger ce provider.
 */
public class AccountsProvider extends ContentProvider {

    public static final String AUTHORITY = "ma.marocjobs.hub.accounts";
    public static final Uri CONTENT_URI = Uri.parse("content://" + AUTHORITY + "/accounts");

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        String json = "[]";
        Context ctx = getContext();
        if (ctx != null) {
            json = ctx.getSharedPreferences("accounts_store", Context.MODE_PRIVATE).getString("json", "[]");
        }
        MatrixCursor cursor = new MatrixCursor(new String[]{"json"});
        cursor.addRow(new Object[]{json});
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        return "application/json";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
