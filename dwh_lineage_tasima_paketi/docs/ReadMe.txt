python --version
pip install sqlglot (dosyadan okurken)
pip install psycopg2-binary
pip install flask

Ana katalog akışı:
1. Kök klasördeki .txt dosyaları ETL/prosedür kaynağıdır.
   python katalog_parser.py
   Bu script kendi içinde 2 geçiş yapar: ilk geçiş kolon sözlüğünü oluşturur,
   ikinci geçiş alias'sız kolonları bu sözlükle çözmeye çalışır.
2. raporlar/ klasöründeki .sql dosyaları rapor kaynağıdır.
   python rapor_parser.py

Gerçek tablolar PostgreSQL'e aktarılmışsa ve alias'sız kolonları daha iyi
çözmek istiyorsanız opsiyonel metadata akışı:
1. Önce stage.katalog_tablo dolsun diye parser'ı bir kez çalıştırın:
   python katalog_parser.py
2. Gerekirse kaynak şema filtresi verin:
   set PG_SOURCE_SCHEMAS=ofsa_sb,olap,summary_prod
3. PostgreSQL information_schema'dan kolonları stage.katalog_kolon'a yükleyin:
   python postgres_kolon_metadata_yukle.py
4. Alias'sız kolonlar bu metadata ile çözülebilsin diye parser'ları tekrar çalıştırın:
   python katalog_parser.py
   python rapor_parser.py


Windows'ta PostgreSQL kurulumu
1. İndirin
postgresql.org/download/windows adresine gidin, "Download the installer" linkine tıklayın (EDB'nin resmi installer'ına yönlendirir). En güncel sürümü indirin (örn. PostgreSQL 17).
2. Kurulumu çalıştırın
İndirdiğiniz .exe dosyasına çift tıklayın, kurulum sihirbazı açılır. Adımlar:

Installation Directory — varsayılanı değiştirmenize gerek yok.
Select Components — hepsi işaretli kalsın: PostgreSQL Server, pgAdmin 4 (grafik arayüz — SQL yazmak için çok işinize yarayacak), Command Line Tools, Stack Builder.
Data Directory — varsayılan kalsın.
Password — burada postgres süper kullanıcısının şifresini belirlemeniz istenir. Bunu bir yere not edin, unutmayın — çok kullanacaksınız.
Port — varsayılan 5432 kalsın (Oracle'ın 1521'i gibi, bu da Postgres'in standart portu).
Locale — varsayılan kalabilir.

"Next" diyerek ilerleyin, kurulum biter.
3. Kurulumu doğrulayın
Komut satırını açın (Win → cmd), şunu yazın:
psql --version
Bir sürüm numarası görürseniz kurulum tamam. Eğer 'psql' is not recognized hatası alırsanız, kurulum PATH'e eklenmemiş demektir — bu durumda komut satırına tam yol vererek çalıştırabilirsiniz, genelde şöyle bir yerdedir:
"C:\Program Files\PostgreSQL\17\bin\psql.exe" --version
4. Bağlanıp test edin
psql -U postgres
Şifre soracak, 2. adımda belirlediğiniz şifreyi girin. postgres=# diye bir komut satırı görürseniz bağlantı başarılı demektir. Çıkmak için \q yazıp Enter'a basın



Yol A: pgAdmin ile (grafik arayüz, tavsiye ederim)

Başlat menüsünden pgAdmin 4'ü açın.
Sol taraftaki ağaçtan Servers → PostgreSQL → Databases → postgres'e tıklayın.
Üst menüden Tools → Query Tool'u açın (veya postgres veritabanına sağ tıklayıp "Query Tool").
Açılan boş pencereye, indirdiğiniz katalog_semasi.sql dosyasının içeriğini yapıştırın (ya da pencerenin üstündeki klasör ikonuyla dosyayı doğrudan açın).
Üstteki ▶ (Execute/Play) butonuna basın.
Alt panelde "Messages" sekmesinde CREATE SCHEMA, CREATE TABLE gibi satırlar akıp en sonda 6 tablonun listelendiğini görürseniz başarılı demektir.
