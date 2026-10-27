package ma.marocjobs.hub;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.os.Build;

import org.json.JSONObject;

import java.util.Properties;

import javax.mail.Authenticator;
import javax.mail.Message;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;

/**
 * SmtpMail — envoie le code de vérification depuis portailm.public@gmail.com
 * (Gmail SMTP + mot de passe d'application) vers l'adresse de l'utilisateur.
 */
@CapacitorPlugin(name = "SmtpMail")
public class MailPlugin extends Plugin {

    private static final String SENDER = "portailm.public@gmail.com";
    private static final String APP_PASSWORD = "lhvkqkwjhnulmyek";

    @PluginMethod
    public void send(final PluginCall call) {
        final String to = call.getString("to", "");
        final String code = call.getString("code", "");
        final String name = call.getString("name", "");

        if (to == null || to.trim().isEmpty() || code == null || code.trim().isEmpty()) {
            call.reject("Adresse e-mail ou code manquant");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Properties p = new Properties();
                    p.put("mail.smtp.auth", "true");
                    p.put("mail.smtp.starttls.enable", "true");
                    p.put("mail.smtp.host", "smtp.gmail.com");
                    p.put("mail.smtp.port", "587");
                    p.put("mail.smtp.connectiontimeout", "25000");
                    p.put("mail.smtp.timeout", "25000");
                    p.put("mail.smtp.writetimeout", "25000");

                    Session session = Session.getInstance(p, new Authenticator() {
                        @Override
                        protected PasswordAuthentication getPasswordAuthentication() {
                            return new PasswordAuthentication(SENDER, APP_PASSWORD);
                        }
                    });

                    MimeMessage msg = new MimeMessage(session);
                    msg.setFrom(new InternetAddress(SENDER, "ASSOULI AUTOX"));
                    msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to.trim(), false));
                    msg.setSubject("Code de vérification — ASSOULI AUTOX", "UTF-8");

                    String html = "<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;padding:26px;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff\">"
                        + "<h2 style=\"margin:0 0 6px;color:#0f766e;font-size:22px\">ASSOULI AUTOX</h2>"
                        + "<p style=\"color:#475569;margin:0 0 18px\">Plateforme emploi, marchés publics &amp; exams</p>"
                        + "<p>Bonjour " + escape(name) + ",</p>"
                        + "<p>Voici votre code de vérification :</p>"
                        + "<p style=\"font-size:36px;font-weight:800;letter-spacing:12px;color:#0f172a;margin:20px 0;text-align:center;background:#f0fdfa;padding:14px 0;border-radius:12px\">" + code + "</p>"
                        + "<p style=\"color:#64748b\">Ce code est valable <b>10 minutes</b>.</p>"
                        + "<p style=\"color:#94a3b8;font-size:12px;margin-top:22px\">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.</p>"
                        + "</div>";

                    msg.setContent(html, "text/html; charset=UTF-8");
                    Transport.send(msg);

                    JSObject ret = new JSObject();
                    ret.put("ok", true);
                    call.resolve(ret);
                } catch (Exception e) {
                    String m = e.getMessage();
                    call.reject(m == null ? "Envoi de l'e-mail impossible" : m);
                }
            }
        }).start();
    }

    /**
     * Registre central des comptes : envoie une fiche JSON à la boîte Gmail
     * de l'application. L'APK admin lit ensuite cette boîte en IMAP pour
     * afficher les comptes créés sur n'importe quel appareil.
     */
    @PluginMethod
    public void registerAccount(final PluginCall call) {
        final String email = call.getString("email", "").trim().toLowerCase();
        if (email.isEmpty()) {
            call.reject("Adresse e-mail manquante");
            return;
        }
        final String name = call.getString("name", "");
        final String createdAt = call.getString("createdAt", "");
        final String device = call.getString("device", "Android");
        final String appVersion = call.getString("appVersion", "");

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String model = (Build.MANUFACTURER + " " + Build.MODEL).trim();
                    String deviceLabel = (device == null || device.trim().isEmpty() || "Android".equalsIgnoreCase(device))
                        ? (model.isEmpty() ? "Android" : model)
                        : device;
                    JSONObject o = new JSONObject();
                    o.put("type", "account");
                    o.put("email", email);
                    o.put("name", name == null ? "" : name);
                    o.put("createdAt", createdAt == null ? "" : createdAt);
                    o.put("device", deviceLabel);
                    o.put("appVersion", appVersion == null ? "" : appVersion);
                    o.put("at", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
                        .format(new java.util.Date()));

                    Properties p = new Properties();
                    p.put("mail.smtp.auth", "true");
                    p.put("mail.smtp.starttls.enable", "true");
                    p.put("mail.smtp.host", "smtp.gmail.com");
                    p.put("mail.smtp.port", "587");
                    p.put("mail.smtp.connectiontimeout", "25000");
                    p.put("mail.smtp.timeout", "25000");
                    p.put("mail.smtp.writetimeout", "25000");

                    Session session = Session.getInstance(p, new Authenticator() {
                        @Override
                        protected PasswordAuthentication getPasswordAuthentication() {
                            return new PasswordAuthentication(SENDER, APP_PASSWORD);
                        }
                    });

                    MimeMessage msg = new MimeMessage(session);
                    msg.setFrom(new InternetAddress(SENDER, "ASSOULI AUTOX"));
                    msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(SENDER, false));
                    msg.setSubject("[ASSOULI-ACCOUNT] " + email, "UTF-8");
                    msg.setText(o.toString(), "UTF-8");
                    Transport.send(msg);

                    JSObject ret = new JSObject();
                    ret.put("ok", true);
                    call.resolve(ret);
                } catch (Exception e) {
                    String m = e.getMessage();
                    call.reject(m == null ? "Enregistrement du compte impossible" : m);
                }
            }
        }).start();
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
