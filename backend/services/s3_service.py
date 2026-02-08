import os
import boto3
from dotenv import load_dotenv

load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")

s3_client = boto3.client(
    "s3",
    region_name=AWS_REGION,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
)


def upload_file_to_s3(file_obj, filename: str):
    """
    Uploads a file to S3 and returns the S3 key (path).
    """
    s3_client.upload_fileobj(
        file_obj,
        AWS_S3_BUCKET_NAME,
        filename,
    )
    return filename


def download_file_from_s3(filename: str):
    """
    Downloads a file from S3 and returns bytes.
    """
    response = s3_client.get_object(
        Bucket=AWS_S3_BUCKET_NAME,
        Key=filename,
    )
    return response["Body"].read()
