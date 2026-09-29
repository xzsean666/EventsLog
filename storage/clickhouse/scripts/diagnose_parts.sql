-- Diagnostic Query 1: Disk usage and compression ratio per table
SELECT
    database,
    table,
    formatReadableSize(sum(data_compressed_bytes)) AS compressed_size,
    formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed_size,
    round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 2) AS compression_ratio,
    sum(rows) AS total_rows,
    count() AS active_parts
FROM system.parts
WHERE active = 1
GROUP BY database, table
ORDER BY sum(data_compressed_bytes) DESC;

-- Diagnostic Query 2: Part accumulation inspection (> 50 active parts indicates merge lag)
SELECT
    database,
    table,
    partition,
    count() AS active_parts,
    sum(rows) AS total_rows,
    formatReadableSize(sum(data_compressed_bytes)) AS partition_compressed_size
FROM system.parts
WHERE active = 1
GROUP BY database, table, partition
HAVING active_parts > 50
ORDER BY active_parts DESC;
